/**
 * 00_selectors.js — Centralized Selector Registry
 *
 * Every CSS selector used by the auto-accept system lives here.
 * No other module should hardcode selectors.
 */

const SELECTORS = {
    // PANEL LOCATION — where to anchor the overlay
    panels: [
        '#antigravity\\.agentPanel',
        '#workbench\\.parts\\.auxiliarybar',
        '.auxiliary-bar-container',
        '#workbench\\.parts\\.sidebar'
    ],

    // TAB NAVIGATION — CURSOR
    cursorTabs: [
        '#workbench\\.parts\\.auxiliarybar ul[role="tablist"] li[role="tab"]',
        '.monaco-pane-view .monaco-list-row[role="listitem"]',
        'div[role="tablist"] div[role="tab"]',
        '.chat-session-item'
    ],

    // TAB NAVIGATION — ANTIGRAVITY
    antigravityTabs: 'button.grow',

    // ACCEPT BUTTONS — CURSOR
    cursorButtons: ['button', '[class*="button"]', '[class*="anysphere"]'],

    // ACCEPT BUTTONS — ANTIGRAVITY
    antigravityButtons: ['.bg-ide-button-background'],

    // NEW CONVERSATION
    newConversation: "[data-tooltip-id='new-conversation-tooltip']",

    // OVERLAY DOM IDS
    overlayId: '__autoAcceptBgOverlay',
    overlayContainerId: '__autoAcceptBgOverlay-c',
    overlayStyleId: '__autoAcceptBgStyles',

    // BADGE DETECTION
    badgeTag: 'span',
    badgeTexts: ['Good', 'Bad'],

    // ERROR DETECTION
    errorBadges: '.codicon-error, .codicon-warning, [class*="marker-count"]',
    errorSquiggles: '.squiggly-error, .monaco-editor .squiggly-error',
    errorSpanTexts: ['error', 'failed', 'compilation error'],

    // COMMAND CONTEXT
    commandElements: ['pre', 'code', 'pre code'],

    // BUTTON TEXT PATTERNS
    acceptPatterns: ['accept', 'run', 'retry', 'apply', 'execute', 'confirm', 'allow once', 'allow'],
    rejectPatterns: ['skip', 'reject', 'cancel', 'close', 'refine']
};

module.exports = { SELECTORS };
