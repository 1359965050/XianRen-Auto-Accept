/**
 * 04_background_cursor.js — Cursor-specific Background Tab Cycling
 */

const { SELECTORS } = require('./00_selectors');
const { log, queryAll } = require('./01_utils');

async function cursorTabLoop(state, sessionID, updateTabNames) {
    log('[TabLoop] Cursor tab cycling started');
    let index = 0;
    let cycle = 0;
    state._noTabCycles = 0;

    while (state.isRunning && state.sessionID === sessionID) {
        cycle++;

        let tabs = [];
        for (const selector of SELECTORS.cursorTabs) {
            tabs = queryAll(selector);
            if (tabs.length > 0) break;
        }

        if (tabs.length === 0) {
            state._noTabCycles++;
        } else {
            state._noTabCycles = 0;
        }

        if (updateTabNames) updateTabNames(tabs);

        if (tabs.length > 0) {
            const targetTab = tabs[index % tabs.length];
            const tabLabel = targetTab.getAttribute('aria-label') || targetTab.textContent?.trim() || 'unnamed';
            log(`[TabLoop] Cycle ${cycle}: Switching to tab "${tabLabel.substring(0, 40)}"`);
            targetTab.dispatchEvent(new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            }));
            index++;
        }

        await new Promise(r => setTimeout(r, 3000));
    }

    log('[TabLoop] Cursor tab cycling stopped');
}

module.exports = { cursorTabLoop };
