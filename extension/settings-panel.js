const vscode = require('vscode');

class SettingsPanel {
    static currentPanel = null;

    static createOrShow(extensionUri, context) {
        const column = vscode.ViewColumn.One;

        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            SettingsPanel.currentPanel._update(context);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'autoAcceptSettings',
            'XianRen-Auto-Agent: Settings',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        SettingsPanel.currentPanel = new SettingsPanel(panel, context);
    }

    constructor(panel, context) {
        this._panel = panel;
        this._context = context;
        this._update(context);

        this._panel.onDidDispose(() => {
            SettingsPanel.currentPanel = null;
        });

        this._panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'updateFrequency':
                    await vscode.commands.executeCommand('auto-accept.updateFrequency', message.value);
                    vscode.window.showInformationMessage(`Poll frequency updated to ${message.value}ms`);
                    break;
                case 'updateBannedCommands':
                    await vscode.commands.executeCommand('auto-accept.updateBannedCommands', message.value);
                    vscode.window.showInformationMessage(`Banned commands updated (${message.value.length} patterns)`);
                    break;
                case 'updateCustomPatterns':
                    const config = vscode.workspace.getConfiguration('auto-accept');
                    await config.update('customAcceptPatterns', message.value, vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(`Custom patterns updated (${message.value.length} patterns)`);
                    break;
                case 'toggleBackground':
                    await vscode.commands.executeCommand('auto-accept.toggleBackground');
                    break;
                case 'setupCDP':
                    await vscode.commands.executeCommand('auto-accept.relaunch');
                    break;
            }
        });
    }

    _update(context) {
        const bannedCommands = context.globalState.get('auto-accept-banned-commands', [
            'rm -rf /', 'rm -rf ~', 'rm -rf *', 'format c:',
            'del /f /s /q', 'rmdir /s /q', ':(){:|:&};:',
            'dd if=', 'mkfs.', '> /dev/sda', 'chmod -R 777 /'
        ]);
        const pollFrequency = context.globalState.get('auto-accept-poll-frequency', 300);
        const backgroundMode = context.globalState.get('auto-accept-background-mode', false);

        const vscodeConfig = vscode.workspace.getConfiguration('auto-accept');
        const customPatterns = vscodeConfig.get('customAcceptPatterns') || [];

        this._panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XianRen-Auto-Agent Settings</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            padding: 24px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            max-width: 600px;
            margin: 0 auto;
        }
        h1 {
            font-size: 20px;
            margin-bottom: 4px;
        }
        .subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 24px;
            font-size: 13px;
        }
        .section {
            margin-bottom: 24px;
            padding: 16px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
        }
        .section-title {
            font-weight: 600;
            font-size: 14px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .section-desc {
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            margin-bottom: 12px;
        }
        label {
            display: block;
            margin-bottom: 6px;
            font-size: 13px;
            font-weight: 500;
        }
        input[type="range"] {
            width: 100%;
            margin-bottom: 4px;
        }
        .range-value {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            text-align: right;
        }
        textarea {
            width: 100%;
            min-height: 120px;
            padding: 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 12px;
            resize: vertical;
            box-sizing: border-box;
        }
        .btn {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            margin-top: 8px;
            margin-right: 8px;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
        }
        .status-on {
            background: rgba(34, 197, 94, 0.15);
            color: #22c55e;
        }
        .status-off {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
        }
    </style>
</head>
<body>
    <h1>⚡ XianRen-Auto-Agent Settings</h1>
    <p class="subtitle">Configure XianRen-Auto-Agent behavior and safety settings.</p>

    <div class="section">
        <div class="section-title">
            🔄 Poll Frequency
        </div>
        <p class="section-desc">How often XianRen-Auto-Agent checks for accept buttons (lower = faster).</p>
        <label for="freqSlider">Frequency: <span id="freqValue">${pollFrequency}ms</span></label>
        <input type="range" id="freqSlider" min="100" max="2000" step="50" value="${pollFrequency}"
            oninput="document.getElementById('freqValue').textContent = this.value + 'ms'">
        <button class="btn btn-primary" onclick="updateFrequency()">Apply</button>
    </div>

    <div class="section">
        <div class="section-title">
            🖥️ Background Mode
            <span class="status-badge ${backgroundMode ? 'status-on' : 'status-off'}">
                ${backgroundMode ? 'ON' : 'OFF'}
            </span>
        </div>
        <p class="section-desc">Work on all open chats simultaneously. Requires CDP setup.</p>
        <button class="btn btn-primary" onclick="toggleBackground()">
            ${backgroundMode ? 'Disable' : 'Enable'} Background Mode
        </button>
        <button class="btn btn-secondary" onclick="setupCDP()">🔧 Setup CDP</button>
    </div>

    <div class="section">
        <div class="section-title">
            🛡️ Dangerous Command Blocking
        </div>
        <p class="section-desc">Commands matching these patterns will be blocked. One pattern per line.</p>
        <textarea id="bannedCommands">${bannedCommands.join('\n')}</textarea>
        <button class="btn btn-primary" onclick="updateBannedCommands()">Save</button>
    </div>

    <div class="section">
        <div class="section-title">
            🎯 Custom Button Patterns
        </div>
        <p class="section-desc">Custom button texts to auto-click. One pattern per line.</p>
        <textarea id="customPatterns">${customPatterns.join('\n')}</textarea>
        <button class="btn btn-primary" onclick="updateCustomPatterns()">Save</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function updateFrequency() {
            const value = parseInt(document.getElementById('freqSlider').value);
            vscode.postMessage({ command: 'updateFrequency', value });
        }

        function updateBannedCommands() {
            const text = document.getElementById('bannedCommands').value;
            const commands = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            vscode.postMessage({ command: 'updateBannedCommands', value: commands });
        }

        function updateCustomPatterns() {
            const text = document.getElementById('customPatterns').value;
            const patterns = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            vscode.postMessage({ command: 'updateCustomPatterns', value: patterns });
        }

        function toggleBackground() {
            vscode.postMessage({ command: 'toggleBackground' });
        }

        function setupCDP() {
            vscode.postMessage({ command: 'setupCDP' });
        }
    </script>
</body>
</html>`;
    }
}

module.exports = { SettingsPanel };
