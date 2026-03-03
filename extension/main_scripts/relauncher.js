const vscode = require('vscode');
const { execSync, spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const CDP_PORT = 9000;
const CDP_FLAG = `--remote-debugging-port=${CDP_PORT}`;

class Relauncher {
    constructor(logger = console.log) {
        this.platform = os.platform();
        this.logger = logger;
    }

    log(msg) {
        this.logger(`[Relauncher] ${msg}`);
    }

    getIdeName() {
        const appName = vscode.env.appName || '';
        if (appName.toLowerCase().includes('cursor')) return 'Cursor';
        if (appName.toLowerCase().includes('antigravity')) return 'Antigravity';
        return 'Code';
    }

    async ensureCDPAndRelaunch() {
        this.log('Checking if current process has CDP flag...');
        const hasFlag = await this.checkShortcutFlag();
        const ideName = this.getIdeName();

        if (hasFlag) {
            this.log('CDP flag present but port inactive. Prompting for restart.');
            vscode.window.showWarningMessage(
                `XianRen-Auto-Agent: The CDP flag is present, but the debugger port is not responding. Please completely close and restart ${ideName}.`,
                'Restart Now'
            ).then(selection => {
                if (selection === 'Restart Now') {
                    vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            });
            return { success: true, relaunched: false };
        }

        this.log('CDP flag missing in current process. Showing manual setup instructions...');
        const { instructions } = await this.getPlatformScriptAndInstructions();

        // Show setup overlay panel
        try {
            const { SetupPanel } = require('../setup-panel');
            const extensionPath = vscode.extensions.all.find(
                ext => ext.id.toLowerCase().includes('auto-accept')
            )?.extensionUri || vscode.Uri.file(__dirname);

            SetupPanel.createOrShow(extensionPath, '', this.platform, ideName, instructions);
        } catch (err) {
            this.log(`Failed to load SetupPanel: ${err.message}, falling back to notification`);
            await this.showFallbackNotification(instructions, ideName);
        }

        return { success: true, relaunched: false };
    }

    async checkShortcutFlag() {
        const args = process.argv.join(' ');
        return args.includes('--remote-debugging-port=9000');
    }

    async showFallbackNotification(instructions, ideName) {
        vscode.window.showInformationMessage(`XianRen-Auto-Agent: ${instructions}`, 'OK');
    }

    async getPlatformScriptAndInstructions() {
        const ideName = this.getIdeName();
        const flag = '--remote-debugging-port=9000';

        return {
            script: '', // No longer providing automated scripts
            instructions: `Please manually add ${flag} to your ${ideName} launch arguments or shortcut, then restart the IDE completely.`
        };
    }
}

module.exports = { Relauncher };
