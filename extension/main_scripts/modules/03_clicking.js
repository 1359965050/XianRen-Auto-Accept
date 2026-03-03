/**
 * 03_clicking.js — Accept Button Clicking Logic
 */

const { SELECTORS } = require('./00_selectors');
const { log, queryAll } = require('./01_utils');

function isAcceptButton(el, customPatterns = []) {
    let rawText = (el.textContent || '').trim().toLowerCase();

    // Also check title attribute or aria-label if text is empty
    if (!rawText) {
        rawText = (el.getAttribute('title') || el.getAttribute('aria-label') || '').trim().toLowerCase();
    }

    if (rawText.length === 0 || rawText.length > 50) return false;

    // Clean text:
    let text = rawText.replace(/\s*\([^)]*\)$/, ''); // remove parentheses like (Ctrl+Enter)
    text = text.replace(/\s*\(\d+\s*(of|\/)\s*\d+\)$/, ''); // remove count like (1 of 3)
    text = text.replace(/\s+(alt|cmd|ctrl|shift|opt|win|enter|return|↵|\u21b5|\u23ce|⌘|⇧|⌥|⌃|\+)+$/i, ''); // remove separated hotkeys

    // Antigravity specialized fix: It renders as <span>Run</span><span>Alt+↵</span> which becomes "runalt+↵" in textContent
    text = text.replace(/(alt|cmd|ctrl|shift|opt|win|enter|return|↵|\u21b5|\u23ce|⌘|⇧|⌥|⌃|\+)+$/i, '');

    text = text.trim();

    const allAcceptPatterns = [...SELECTORS.acceptPatterns, ...customPatterns].filter(Boolean).map(p => p.toLowerCase());

    // We reject if the EXACT exact matches a reject word (or starts with it, like "Cancel generation")
    if (SELECTORS.rejectPatterns.some(r => text === r || text.startsWith(r + ' '))) return false;

    // We STRICTLY REQUIRE an Exact Match for the accept words to avoid clicking "Run and Debug" when pattern is just "run"
    const isMatched = allAcceptPatterns.some(p => text === p);
    if (!isMatched) return false;

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    return isVisible && style.pointerEvents !== 'none' && !el.disabled;
}

function clickAcceptButtons(ide = 'cursor') {
    const selectors = ide === 'antigravity'
        ? [...SELECTORS.antigravityButtons, ...SELECTORS.cursorButtons]
        : [...SELECTORS.cursorButtons];

    const found = [];
    // globally search all matching selectors via shadow dom piercing utils
    selectors.forEach(s => queryAll(s).forEach(el => found.push(el)));

    let clicked = 0;
    const uniqueFound = [...new Set(found)];

    for (const el of uniqueFound) {
        if (isAcceptButton(el, window.__autoAcceptState?.customPatterns)) {
            const buttonText = (el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || '').trim();
            log(`Clicking: "${buttonText}"`);

            // Dispatch full sequence of mouse/pointer events to ensure React/Solid triggers
            el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

            clicked++;
        }
    }

    return clicked;
}

function hasCompilationErrors() {
    const errorBadges = queryAll(SELECTORS.errorBadges);
    for (const badge of errorBadges) {
        const text = (badge.textContent || '').trim();
        const num = parseInt(text, 10);
        if (!isNaN(num) && num > 0) return true;
    }

    const errorDecorations = queryAll(SELECTORS.errorSquiggles);
    if (errorDecorations.length > 0) return true;

    return false;
}

module.exports = { isAcceptButton, clickAcceptButtons, hasCompilationErrors };
