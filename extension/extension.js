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
let currentIDE = 'unknown';
let globalContext;

// === IDE Accept Commands ===
const ACCEPT_COMMANDS_ANTIGRAVITY = [
    'antigravity.agent.acceptAgentStep',
    'antigravity.command.accept',
    'antigravity.prioritized.agentAcceptAllInFile',
    'antigravity.prioritized.agentAcceptFocusedHunk',
    'antigravity.prioritized.supercompleteAccept',
    'antigravity.terminalCommand.accept',
    'antigravity.acceptCompletion',
    'antigravity.prioritized.terminalSuggestion.accept'
];

const ACCEPT_COMMANDS_CURSOR = [
    'cursorai.action.acceptAndRunGenerateInTerminal',
    'cursorai.action.acceptGenerateInTerminal'
];

function getAcceptCommandsForIDE() {
    const ide = (currentIDE || '').toLowerCase();
    if (ide === 'antigravity') return ACCEPT_COMMANDS_ANTIGRAVITY;
    if (ide === 'cursor') return ACCEPT_COMMANDS_CURSOR;
    return [];
}

async function executeAcceptCommandsForIDE() {
    const commands = getAcceptCommandsForIDE();
    if (commands.length === 0) return;
    await Promise.allSettled(commands.map(cmd => vscode.commands.executeCommand(cmd)));
}

// === CDP Handlers ===
let cdpHandler;
let relauncher;

function log(message) {
    try {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const logLine = `[${timestamp}] ${message}`;
        console.log(logLine);
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
            })
        );

        // 6. Check environment and start if enabled
        try {
            await checkEnvironmentAndStart();
        } catch (err) {
            log(`Error in environment check: ${err.message}`);
        }

        log('XianRen: Activation complete');
    } catch (error) {
        console.error('ACTIVATION CRITICAL FAILURE:', error);
        log(`ACTIVATION CRITICAL FAILURE: ${error.message}`);
        vscode.window.showErrorMessage(`XianRen Extension failed to activate: ${error.message}`);
    }
}

// === CDP Environment ===
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
        if (showPrompt && relauncher) {
            log('Initiating CDP setup flow...');
            await relauncher.ensureCDPAndRelaunch();
        }
        return false;
    }
}

async function checkEnvironmentAndStart() {
    if (isEnabled) {
        log('Initializing XianRen environment...');
        await startPolling();
        ensureCDPOrPrompt(false);
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
            startPolling();
            ensureCDPOrPrompt(false);
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
    log('Auto Accept: Monitoring session...');

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
    log('Auto Accept: Polling stopped');
}

// === Away Actions ===
async function showAwayActionsNotification(context, actionsCount) {
    log(`[Notification] showAwayActionsNotification called with: ${actionsCount}`);
    if (!actionsCount || actionsCount === 0) return;

    const message = `Auto Accept handled ${actionsCount} action${actionsCount > 1 ? 's' : ''} while you were away.`;
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
        let tooltip = `Auto Accept is running.`;
        let bgColor = undefined;
        let icon = '$(check)';

        const cdpConnected = cdpHandler && cdpHandler.getConnectionCount() > 0;
        if (cdpConnected) {
            tooltip += ' (CDP Connected)';
        }

        statusBarItem.text = `${icon} Auto Accept: ${statusText}`;
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
        statusBarItem.text = '$(circle-slash) Auto Accept: OFF';
        statusBarItem.tooltip = 'Click to enable Auto Accept.';
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
