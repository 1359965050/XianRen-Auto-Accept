const vscode = require('vscode');

class SetupPanel {
    static currentPanel = null;

    static createOrShow(extensionUri, script, platform, ideName) {
        const column = vscode.ViewColumn.One;

        if (SetupPanel.currentPanel) {
            SetupPanel.currentPanel._panel.reveal(column);
            SetupPanel.currentPanel._update(script, platform, ideName);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'autoAcceptSetup',
            `XianRen-Auto-Agent: ${ideName} CDP Setup`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        SetupPanel.currentPanel = new SetupPanel(panel, script, platform, ideName);
    }

    constructor(panel, script, platform, ideName) {
        this._panel = panel;
        this._update(script, platform, ideName);

        this._panel.onDidDispose(() => {
            SetupPanel.currentPanel = null;
        });

        this._panel.webview.onDidReceiveMessage(async (message) => {
            if (message.command === 'copyScript') {
                await vscode.env.clipboard.writeText(message.script);
                vscode.window.showInformationMessage('Setup script copied to clipboard!');
            } else if (message.command === 'restart') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        });
    }

    _update(script, platform, ideName) {
        const platformName = platform === 'win32' ? 'Windows (PowerShell)'
            : platform === 'darwin' ? 'macOS (Terminal)'
                : 'Linux (Terminal)';

        this._panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>XianRen-Auto-Agent CDP Setup</title>
    <style>
        body {
            font-family: system-ui, -apple-system, sans-serif;
            padding: 24px;
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            max-width: 700px;
            margin: 0 auto;
        }
        h1 {
            font-size: 20px;
            margin-bottom: 8px;
            color: var(--vscode-foreground);
        }
        .subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 24px;
            font-size: 13px;
        }
        .step {
            margin-bottom: 20px;
            padding: 16px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 8px;
            border: 1px solid var(--vscode-widget-border);
        }
        .step-number {
            display: inline-block;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            text-align: center;
            line-height: 24px;
            font-size: 12px;
            font-weight: bold;
            margin-right: 10px;
        }
        .step-title {
            font-weight: 600;
            font-size: 14px;
        }
        .step-desc {
            margin-top: 8px;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }
        .script-box {
            background: var(--vscode-textCodeBlock-background, #1e1e1e);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 6px;
            padding: 12px;
            margin-top: 12px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 11px;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            color: var(--vscode-editor-foreground);
        }
        .btn {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            margin-top: 12px;
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
        .platform-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            margin-left: 8px;
        }
    </style>
</head>
<body>
    <h1>CDP Setup <span class="platform-badge">${platformName}</span></h1>
    <p class="subtitle">Enable Chrome DevTools Protocol to unlock Background Mode for ${ideName}.</p>

    <div class="step">
        <span class="step-number">1</span>
        <span class="step-title">Copy the setup script</span>
        <p class="step-desc">Click the button below to copy the script to your clipboard.</p>
        <div class="script-box" id="scriptBox">${escapeHtml(script)}</div>
        <button class="btn btn-primary" onclick="copyScript()">📋 Copy Script</button>
    </div>

    <div class="step">
        <span class="step-number">2</span>
        <span class="step-title">Run it in ${platform === 'win32' ? 'PowerShell (Administrator)' : 'Terminal'}</span>
        <p class="step-desc">Open ${platform === 'win32' ? 'PowerShell as Administrator' : 'your terminal'}, paste the script, and press Enter.</p>
    </div>

    <div class="step">
        <span class="step-number">3</span>
        <span class="step-title">Restart ${ideName}</span>
        <p class="step-desc">Completely close and reopen ${ideName} for the changes to take effect.</p>
        <button class="btn btn-secondary" onclick="restart()">🔄 Restart Now</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const scriptContent = ${JSON.stringify(script)};

        function copyScript() {
            vscode.postMessage({ command: 'copyScript', script: scriptContent });
        }

        function restart() {
            vscode.postMessage({ command: 'restart' });
        }
    </script>
</body>
</html>`;
    }
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

module.exports = { SetupPanel };
