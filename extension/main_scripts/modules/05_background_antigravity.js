/**
 * 05_background_antigravity.js — Antigravity-specific Background Tab Cycling
 */

const { SELECTORS } = require('./00_selectors');
const { log, queryAll, stripTimeSuffix } = require('./01_utils');
const { hasCompilationErrors } = require('./03_clicking');

async function antigravityTabLoop(state, sessionID, updateTabNames, updateCompletionState, markCompleted) {
    log('[TabLoop] Antigravity tab cycling started');
    let index = 0;
    let cycle = 0;
    state._noTabCycles = 0;

    while (state.isRunning && state.sessionID === sessionID) {
        cycle++;

        // Check for completion badges on current tab
        const allSpans = queryAll(SELECTORS.badgeTag);
        const feedbackBadges = allSpans.filter(s => {
            const t = s.textContent.trim();
            return SELECTORS.badgeTexts.includes(t);
        });
        log(`[TabLoop] Cycle ${cycle}: ${feedbackBadges.length} badges on current tab`);

        // Click "New Conversation" button to show tabs panel
        const nt = queryAll(SELECTORS.newConversation)[0];
        if (nt) nt.click();

        await new Promise(r => setTimeout(r, 1500));
        if (!(state.isRunning && state.sessionID === sessionID)) break;

        // Find tabs
        const tabs = queryAll(SELECTORS.antigravityTabs);

        if (tabs.length === 0) {
            state._noTabCycles++;
            log(`[TabLoop] Cycle ${cycle}: No tabs found (consecutive: ${state._noTabCycles})`);
        } else {
            state._noTabCycles = 0;
        }

        if (updateTabNames) updateTabNames(tabs);

        // Click next tab
        let clickedTabName = null;
        if (tabs.length > 0) {
            const targetTab = tabs[index % tabs.length];
            clickedTabName = stripTimeSuffix(targetTab.textContent);
            log(`[TabLoop] Cycle ${cycle}: Switching to tab "${clickedTabName}"`);
            targetTab.dispatchEvent(new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            }));
            index++;
        }

        await new Promise(r => setTimeout(r, 1500));
        if (!(state.isRunning && state.sessionID === sessionID)) break;

        // Check for completion badges AFTER tab switch
        const allSpansAfter = queryAll(SELECTORS.badgeTag);
        const feedbackTexts = allSpansAfter
            .filter(s => SELECTORS.badgeTexts.includes(s.textContent.trim()))
            .map(s => s.textContent.trim());

        if (clickedTabName && feedbackTexts.length > 0) {
            const hasErrors = hasCompilationErrors();
            const finalStatus = hasErrors ? 'done-errors' : 'done';
            if (updateCompletionState) updateCompletionState(clickedTabName, finalStatus);

            const deduplicatedNames = state.tabNames || [];
            const currentIndex = (index - 1) % deduplicatedNames.length;
            const deduplicatedName = deduplicatedNames[currentIndex];
            if (deduplicatedName && markCompleted) {
                markCompleted(deduplicatedName);
            }
        }

        log(`[TabLoop] Cycle ${cycle}: ${state.tabNames?.length || 0} tabs`);

        await new Promise(r => setTimeout(r, 3000));
    }

    log('[TabLoop] Antigravity tab cycling stopped');
}

module.exports = { antigravityTabLoop };
