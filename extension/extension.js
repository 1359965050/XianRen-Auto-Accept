const vscode = require('vscode');

// Lazy load SettingsPanel to avoid blocking activation
let SettingsPanel = null;
function getSettingsPanel() {
    if (!SettingsPanel) {
        try {
            SettingsPanel = require('./settings-panel').SettingsPanel;
        } catch (e) {
            console.error('Failed to load SettingsPanel:', e);
        }
    }
    return SettingsPanel;
}

// === State Keys ===
const GLOBAL_STATE_KEY = 'auto-accept-enabled-global';
const BANNED_COMMANDS_KEY = 'auto-accept-banned-commands';
const BACKGROUND_DONT_SHOW_KEY = 'auto-accept-background-dont-show';
const BACKGROUND_MODE_KEY = 'auto-accept-background-mode';
const FREQ_STATE_KEY = 'auto-accept-poll-frequency';

// === State Variables ===
let isEnabled = false;
let pollFrequency = 300;
let bannedCommands = [];
let backgroundModeEnabled = false;

let pollTimer;
let commandPollTimer;
let statusBarItem;
let statusSettingsItem;
let statusBackgroundItem;
let outputChannel;
let lastFocusTime = 0;
let globalContext;

// === IDE Accept Commands (verified from command discovery log) ===
const SAFE_COMMANDS_ANTIGRAVITY = [
    'antigravity.agent.acceptAgentStep',
    'antigravity.terminalCommand.accept',
    'antigravity.terminalCommand.run',
    'antigravity.command.accept',
    'antigravity.prioritized.agentAcceptAllInFile',
    'antigravity.prioritized.agentAcceptFocusedHunk',
    'antigravity.acceptCompletion',
    'antigravity.prioritized.supercompleteAccept'
];

const SAFE_COMMANDS_CURSOR = [
    'cursorai.action.acceptAndRunGenerateInTerminal',
    'cursorai.action.acceptGenerateInTerminal'
];

let verifiedCommands = null; // Will be set after first verification run
let firstRunLogged = false;

async function discoverAcceptCommands() {
    try {
        const allCommands = await vscode.commands.getCommands(true);
        const ide = (currentIDE || '').toLowerCase();
        const prefix = ide === 'cursor' ? 'cursorai' : (ide === 'antigravity' ? 'antigravity' : '');

        if (!prefix) {
            log('Command discovery: Unknown IDE, skipping');
            return;
        }

        // Verify which safe commands actually exist
        const safeList = ide === 'antigravity' ? SAFE_COMMANDS_ANTIGRAVITY : SAFE_COMMANDS_CURSOR;
        verifiedCommands = safeList.filter(cmd => allCommands.includes(cmd));

        log(`Command discovery: Detected IDE = ${currentIDE}`);
        log(`Command discovery: ${verifiedCommands.length}/${safeList.length} commands verified:`);
        verifiedCommands.forEach(cmd => log(`  ✓ ${cmd}`));

        const missing = safeList.filter(cmd => !allCommands.includes(cmd));
        if (missing.length > 0) {
            log(`Command discovery: missing commands:`);
            missing.forEach(cmd => log(`  ✗ ${cmd}`));
        }
    } catch (e) {
        log(`Command discovery failed: ${e.message}`);
    }
}

async function executeAcceptCommandsForIDE() {
    if (!verifiedCommands || verifiedCommands.length === 0) return;

    // Focus the agent panel only if enough time has passed (e.g., 10 seconds)
    // to avoid stealing focus too frequently while the user is typing.
    const now = Date.now();
    if (now - lastFocusTime > 10000) {
        try {
            await vscode.commands.executeCommand('antigravity.agentPanel.focus');
            lastFocusTime = now;
        } catch (e) { }
    }

    for (const cmd of verifiedCommands) {
        try {
            await vscode.commands.executeCommand(cmd);
            if (!firstRunLogged) {
                log(`  exec OK: ${cmd}`);
            }
        } catch (e) {
            if (!firstRunLogged) {
                log(`  exec FAIL: ${cmd} -> ${e.message}`);
            }
        }
    }

    if (!firstRunLogged) {
        firstRunLogged = true;
        log('First command execution cycle complete.');
    }
}

// === CDP Handlers ===
let cdpHandler;
let relauncher;

function log(message) {
    try {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const logLine = `[${timestamp}] ${message}`;
        console.log(logLine);
        if (outputChannel) {
            outputChannel.appendLine(logLine);
        }
    } catch (e) {
        console.error('Logging failed:', e);
    }
}

function detectIDE() {
    const appName = vscode.env.appName || '';
    if (appName.toLowerCase().includes('cursor')) return 'Cursor';
    if (appName.toLowerCase().includes('antigravity')) return 'Antigravity';
    return 'Code';
}

// === Activation ===
async function activate(context) {
    globalContext = context;
    console.log('XianRen Extension: Activator called.');

    // Create status bar items FIRST
    try {
        statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        statusBarItem.command = 'auto-accept.toggle';
        statusBarItem.text = '$(sync~spin) XianRen: Loading...';
        statusBarItem.tooltip = 'XianRen is initializing...';
        context.subscriptions.push(statusBarItem);
        statusBarItem.show();

        statusSettingsItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
        statusSettingsItem.command = 'auto-accept.openSettings';
        statusSettingsItem.text = '$(gear)';
        statusSettingsItem.tooltip = 'XianRen Settings';
        context.subscriptions.push(statusSettingsItem);
        statusSettingsItem.show();

        statusBackgroundItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        statusBackgroundItem.command = 'auto-accept.toggleBackground';
        statusBackgroundItem.text = '$(globe) Background: OFF';
        statusBackgroundItem.tooltip = 'Background Mode - Works on all chats';
        context.subscriptions.push(statusBackgroundItem);

        console.log('XianRen: Status bar items created and shown.');
    } catch (sbError) {
        console.error('CRITICAL: Failed to create status bar items:', sbError);
    }

    try {
        // 1. Initialize State
        isEnabled = context.globalState.get(GLOBAL_STATE_KEY, false);
        pollFrequency = context.globalState.get(FREQ_STATE_KEY, 300);
        backgroundModeEnabled = context.globalState.get(BACKGROUND_MODE_KEY, false);

        // Load banned commands list
        const defaultBannedCommands = [
            'rm -rf /',
            'rm -rf ~',
            'rm -rf *',
            'format c:',
            'del /f /s /q',
            'rmdir /s /q',
            ':(){:|:&};:',
            'dd if=',
            'mkfs.',
            '> /dev/sda',
            'chmod -R 777 /'
        ];
        bannedCommands = context.globalState.get(BANNED_COMMANDS_KEY, defaultBannedCommands);

        currentIDE = detectIDE();

        // 2. Create Output Channel
        outputChannel = vscode.window.createOutputChannel('XianRen');
        context.subscriptions.push(outputChannel);

        log(`XianRen: Activating...`);
        log(`XianRen: Detected environment: ${currentIDE.toUpperCase()}`);

        // Setup Focus Listener
        vscode.window.onDidChangeWindowState(async (e) => {
            if (cdpHandler && cdpHandler.setFocusState) {
                await cdpHandler.setFocusState(e.focused);
            }
            if (e.focused && isEnabled) {
                log(`[Away] Window focus detected. Checking for away actions...`);
                setTimeout(() => checkForAwayActions(context), 500);
            }
        });

        // 3. Initialize CDP Handlers
        try {
            const { CDPHandler } = require('./main_scripts/cdp-handler');
            const { Relauncher } = require('./main_scripts/relauncher');

            cdpHandler = new CDPHandler(log);
            relauncher = new Relauncher(log);
            log(`CDP handlers initialized for ${currentIDE}.`);
        } catch (err) {
            log(`Failed to initialize CDP handlers: ${err.message}`);
            vscode.window.showErrorMessage(`XianRen Error: ${err.message}`);
        }

        // 3.5. Discover accept commands for current IDE
        await discoverAcceptCommands();

        // 4. Update Status Bar
        updateStatusBar();
        log('Status bar updated with current state.');

        // 5. Register Commands
        context.subscriptions.push(
            vscode.commands.registerCommand('auto-accept.toggle', () => handleToggle(context)),
            vscode.commands.registerCommand('auto-accept.relaunch', () => handleRelaunch()),
            vscode.commands.registerCommand('auto-accept.updateFrequency', (freq) => handleFrequencyUpdate(context, freq)),
            vscode.commands.registerCommand('auto-accept.toggleBackground', () => handleBackgroundToggle(context)),
            vscode.commands.registerCommand('auto-accept.updateBannedCommands', (commands) => handleBannedCommandsUpdate(context, commands)),
            vscode.commands.registerCommand('auto-accept.getBannedCommands', () => bannedCommands),
            vscode.commands.registerCommand('auto-accept.openSettings', () => {
                const panel = getSettingsPanel();
                if (panel) {
                    panel.createOrShow(context.extensionUri, context);
                } else {
                    vscode.window.showErrorMessage('Failed to load Settings Panel.');
                }
            }),
            vscode.commands.registerCommand('auto-accept.reset-cdp', async () => {
                await context.globalState.update(CDP_SETUP_DONE_KEY, false);
                vscode.window.showInformationMessage('XianRen: CDP Setup flag reset.');
                log('CDP Setup flag reset by user command.');
            })
        );

        // 6. Check environment and start if enabled
        try {
            await checkEnvironmentAndStart();
        } catch (err) {
            log(`Error in environment check: ${err.message}`);
        }

        // 7. Auto-setup CDP if not available (runs regardless of toggle state)
        try {
            const cdpOk = cdpHandler ? await cdpHandler.isCDPAvailable() : false;
            log(`Activation CDP check: ${cdpOk}`);
            if (!cdpOk) {
                await autoCDPSetup();
            }
        } catch (err) {
            log(`AutoCDP activation error: ${err.message}`);
        }

        log('XianRen: Activation complete');
    } catch (error) {
        console.error('ACTIVATION CRITICAL FAILURE:', error);
        log(`ACTIVATION CRITICAL FAILURE: ${error.message}`);
        vscode.window.showErrorMessage(`XianRen Extension failed to activate: ${error.message}`);
    }
}

// === CDP Environment ===
const CDP_SETUP_DONE_KEY = 'auto-accept-cdp-setup-done';

async function ensureCDPOrPrompt(showPrompt = false) {
    if (!cdpHandler) return false;

    log('Checking for active CDP session...');
    const cdpAvailable = await cdpHandler.isCDPAvailable();
    log(`Environment check: CDP Available = ${cdpAvailable}`);

    if (cdpAvailable) {
        log('CDP is active and available.');
        return true;
    } else {
        log('CDP not found on target ports (9000 +/- 3).');
        return false;
    }
}

async function autoCDPSetup() {
    if (!globalContext) return;

    log('[AutoCDP] Entering autoCDPSetup...');

    const os = require('os');
    const fs = require('fs');
    const path = require('path');

    if (os.platform() !== 'win32') {
        log('[AutoCDP] Non-Windows platform, skipping auto setup.');
        return;
    }

    log('[AutoCDP] CDP not available and we are on Windows. Auto-configuring shortcuts...');

    const ideName = 'Antigravity';
    const script = `
$WshShell = New-Object -ComObject WScript.Shell
$searchLocations = @(
    [Environment]::GetFolderPath('Desktop'),
    "$env:USERPROFILE\\Desktop",
    "$env:USERPROFILE\\OneDrive\\Desktop",
    "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs",
    "$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
    "$env:USERPROFILE\\AppData\\Roaming\\Microsoft\\Internet Explorer\\Quick Launch\\User Pinned\\TaskBar"
)
$count = 0
foreach ($location in $searchLocations) {
    if (Test-Path $location) {
        $shortcuts = Get-ChildItem -Path $location -Recurse -Filter "*.lnk" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -like "*${ideName}*" }
        foreach ($s in $shortcuts) {
            try {
                $sc = $WshShell.CreateShortcut($s.FullName)
                if ($sc.Arguments -notmatch "remote-debugging-port") {
                    $sc.Arguments = "--remote-debugging-port=9000 " + $sc.Arguments
                    $sc.Save()
                    $count++
                }
            } catch {}
        }
    }
}
Write-Output "DONE:$count"
`;

    const tempPs1 = path.join(os.tmpdir(), `antigravity_cdp_setup_${Date.now()}.ps1`);
    try {
        fs.writeFileSync(tempPs1, '\ufeff' + script, 'utf8'); // Add UTF8 BOM for PowerShell

        const { execSync } = require('child_process');
        const result = execSync(`powershell -ExecutionPolicy Bypass -NonInteractive -File "${tempPs1}"`, {
            encoding: 'utf8',
            timeout: 15000,
            windowsHide: true
        });

        log(`[AutoCDP] Script result: ${result.trim()}`);

        const match = result.match(/DONE:(\d+)/);
        const modified = match ? parseInt(match[1], 10) : 0;

        await globalContext.globalState.update(CDP_SETUP_DONE_KEY, true);

        if (modified > 0) {
            log(`[AutoCDP] Modified ${modified} shortcut(s). Prompting restart.`);
            const choice = await vscode.window.showInformationMessage(
                `XianRen-Auto-Agent: 已自动配置 ${modified} 个快捷方式。请重启 Antigravity 以激活自动点击功能。`,
                '立即重启',
                '稍后'
            );
            if (choice === '立即重启') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        } else {
            log('[AutoCDP] No shortcuts found to modify. Trying to create one...');
            const exePath = process.execPath;

            const createScript = `
$WshShell = New-Object -ComObject WScript.Shell
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath "${ideName}.lnk"
if (-not (Test-Path $shortcutPath)) {
    $shortcut = $WshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "${exePath.replace(/\\/g, '\\\\')}"
    $shortcut.Arguments = "--remote-debugging-port=9000"
    $shortcut.Save()
    Write-Output "CREATED"
} else {
    Write-Output "EXISTS"
}
`;
            fs.writeFileSync(tempPs1, '\ufeff' + createScript, 'utf8');
            const createResult = execSync(`powershell -ExecutionPolicy Bypass -NonInteractive -File "${tempPs1}"`, {
                encoding: 'utf8',
                timeout: 10000,
                windowsHide: true
            });

            log(`[AutoCDP] Create shortcut result: ${createResult.trim()}`);

            if (createResult.includes('CREATED')) {
                await vscode.window.showInformationMessage(
                    'XianRen-Auto-Agent: 已在桌面创建带调试参数的快捷方式。请用该快捷方式重启 Antigravity。',
                    '知道了'
                );
            }
        }
    } catch (e) {
        log(`[AutoCDP] Auto setup failed: ${e.message}`);
    } finally {
        if (fs.existsSync(tempPs1)) {
            try { fs.unlinkSync(tempPs1); } catch { }
        }
    }
}

async function checkEnvironmentAndStart() {
    if (isEnabled) {
        log('Initializing XianRen environment...');
        await startPolling();
        const cdpOk = await ensureCDPOrPrompt(false);
        if (!cdpOk) {
            await autoCDPSetup();
        }
    }
    updateStatusBar();
}

// === Toggle Handlers ===
async function handleToggle(context) {
    log('=== handleToggle CALLED ===');
    log(`  Previous isEnabled: ${isEnabled}`);

    try {
        isEnabled = !isEnabled;
        log(`  New isEnabled: ${isEnabled}`);

        await context.globalState.update(GLOBAL_STATE_KEY, isEnabled);
        log(`  GlobalState updated`);

        log('  Calling updateStatusBar...');
        updateStatusBar();

        if (isEnabled) {
            log('XianRen: Enabled');
            await startPolling();
            const cdpOk = await ensureCDPOrPrompt(false);
            if (!cdpOk) {
                await autoCDPSetup();
            }
        } else {
            log('XianRen: Disabled');
            stopPolling().catch(() => { });
        }

        log('=== handleToggle COMPLETE ===');
    } catch (e) {
        log(`Error toggling: ${e.message}`);
        log(`Error stack: ${e.stack}`);
    }
}

async function handleRelaunch() {
    if (!relauncher) {
        vscode.window.showErrorMessage('Relauncher not initialized.');
        return;
    }
    log('Initiating CDP Setup flow...');
    await relauncher.ensureCDPAndRelaunch();
}

async function handleFrequencyUpdate(context, freq) {
    pollFrequency = freq;
    await context.globalState.update(FREQ_STATE_KEY, freq);
    log(`Poll frequency updated to: ${freq}ms`);
    if (isEnabled) {
        await syncSessions();
        if (commandPollTimer) {
            clearInterval(commandPollTimer);
        }
        commandPollTimer = setInterval(() => {
            if (!isEnabled) return;
            executeAcceptCommandsForIDE().catch(() => { });
        }, pollFrequency);
    }
}

async function handleBannedCommandsUpdate(context, commands) {
    bannedCommands = Array.isArray(commands) ? commands : [];
    await context.globalState.update(BANNED_COMMANDS_KEY, bannedCommands);
    log(`Banned commands updated: ${bannedCommands.length} patterns`);
    if (bannedCommands.length > 0) {
        log(`Banned patterns: ${bannedCommands.slice(0, 5).join(', ')}${bannedCommands.length > 5 ? '...' : ''}`);
    }
    if (isEnabled) {
        await syncSessions();
    }
}

async function handleBackgroundToggle(context) {
    log('Background toggle clicked');

    // CDP required for Background Mode
    if (!backgroundModeEnabled) {
        const cdpAvailable = cdpHandler ? await cdpHandler.isCDPAvailable() : false;
        if (!cdpAvailable && relauncher) {
            log('Background Mode requires CDP. Prompting for setup...');
            await relauncher.ensureCDPAndRelaunch();
            return;
        }
    }

    // Check if we should show first-time dialog
    const dontShowAgain = context.globalState.get(BACKGROUND_DONT_SHOW_KEY, false);

    if (!dontShowAgain && !backgroundModeEnabled) {
        const choice = await vscode.window.showInformationMessage(
            'Turn on Background Mode?\n\n' +
            'This lets XianRen work on all your open chats at once. ' +
            'It will switch between tabs to click Accept for you.\n\n' +
            'You might see tabs change quickly while it works.',
            { modal: true },
            'Enable',
            "Don't Show Again & Enable",
            'Cancel'
        );

        if (choice === 'Cancel' || !choice) {
            log('Background mode cancelled by user');
            return;
        }

        if (choice === "Don't Show Again & Enable") {
            await context.globalState.update(BACKGROUND_DONT_SHOW_KEY, true);
            log('Background mode: Dont show again set');
        }

        backgroundModeEnabled = true;
        await context.globalState.update(BACKGROUND_MODE_KEY, true);
        log('Background mode enabled');
    } else {
        // Simple toggle
        backgroundModeEnabled = !backgroundModeEnabled;
        await context.globalState.update(BACKGROUND_MODE_KEY, backgroundModeEnabled);
        log(`Background mode toggled: ${backgroundModeEnabled}`);

        if (!backgroundModeEnabled && cdpHandler && isEnabled) {
            log('Background mode OFF: Stopping background loops...');
            await cdpHandler.stop();
            await syncSessions();
            log('Background mode OFF: Restarted in simple mode');
        } else if (backgroundModeEnabled && cdpHandler && isEnabled) {
            log('Background mode ON: Switching to background mode...');
            await syncSessions();
        }

        if (!backgroundModeEnabled && cdpHandler) {
            cdpHandler.hideBackgroundOverlay().catch(() => { });
        }
    }

    updateStatusBar();
}

// === Session Management ===
async function syncSessions() {
    if (cdpHandler) {
        log(`CDP: Syncing sessions (Mode: ${backgroundModeEnabled ? 'Background' : 'Simple'})...`);
        try {
            await cdpHandler.start({
                isPro: true,
                isBackgroundMode: backgroundModeEnabled,
                pollInterval: pollFrequency,
                ide: currentIDE,
                bannedCommands: bannedCommands
            });
        } catch (err) {
            log(`CDP: Sync error: ${err.message}`);
        }
    }
}

async function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    if (commandPollTimer) clearInterval(commandPollTimer);
    log('XianRen-Auto-Agent: Monitoring session...');

    // Initial trigger
    await syncSessions();
    await executeAcceptCommandsForIDE();

    // IDE command polling
    commandPollTimer = setInterval(() => {
        if (!isEnabled) return;
        executeAcceptCommandsForIDE().catch(() => { });
    }, pollFrequency);

    // CDP sync polling
    pollTimer = setInterval(async () => {
        if (!isEnabled) return;
        await syncSessions();
    }, 5000);
}

async function stopPolling() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
    if (commandPollTimer) {
        clearInterval(commandPollTimer);
        commandPollTimer = null;
    }
    if (cdpHandler) await cdpHandler.stop();
    log('XianRen-Auto-Agent: Polling stopped');
}

// === Away Actions ===
async function showAwayActionsNotification(context, actionsCount) {
    log(`[Notification] showAwayActionsNotification called with: ${actionsCount}`);
    if (!actionsCount || actionsCount === 0) return;

    const message = `XianRen-Auto-Agent handled ${actionsCount} action${actionsCount > 1 ? 's' : ''} while you were away.`;
    vscode.window.showInformationMessage(message, 'OK');
}

async function checkForAwayActions(context) {
    log(`[Away] checkForAwayActions called. cdpHandler=${!!cdpHandler}, isEnabled=${isEnabled}`);
    if (!cdpHandler || !isEnabled) return;

    try {
        const awayActions = await cdpHandler.getAwayActions();
        if (awayActions > 0) {
            log(`[Away] Detected ${awayActions} actions while user was away.`);
            await showAwayActionsNotification(context, awayActions);
        }
    } catch (e) {
        log(`[Away] Error checking away actions: ${e.message}`);
    }
}

// === Status Bar ===
function updateStatusBar() {
    if (!statusBarItem) return;

    if (isEnabled) {
        let statusText = 'ON';
        let tooltip = `XianRen-Auto-Agent is running.`;
        let bgColor = undefined;
        let icon = '$(check)';

        const cdpConnected = cdpHandler && cdpHandler.getConnectionCount() > 0;
        if (cdpConnected) {
            tooltip += ' (CDP Connected)';
        }

        statusBarItem.text = `${icon} XianRen-Auto-Agent: ${statusText}`;
        statusBarItem.tooltip = tooltip;
        statusBarItem.backgroundColor = bgColor;

        // Show Background Mode toggle when Auto Accept is ON
        if (statusBackgroundItem) {
            if (backgroundModeEnabled) {
                statusBackgroundItem.text = '$(sync~spin) Background: ON';
                statusBackgroundItem.tooltip = 'Background Mode is on. Click to turn off.';
                statusBackgroundItem.backgroundColor = undefined;
            } else {
                statusBackgroundItem.text = '$(globe) Background: OFF';
                statusBackgroundItem.tooltip = 'Click to turn on Background Mode.';
                statusBackgroundItem.backgroundColor = undefined;
            }
            statusBackgroundItem.show();
        }
    } else {
        statusBarItem.text = '$(circle-slash) XianRen-Auto-Agent: OFF';
        statusBarItem.tooltip = 'Click to enable XianRen-Auto-Agent.';
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');

        if (statusBackgroundItem) {
            statusBackgroundItem.hide();
        }
    }
}

function deactivate() {
    stopPolling();
    if (cdpHandler) {
        cdpHandler.stop();
    }
}

module.exports = { activate, deactivate };
