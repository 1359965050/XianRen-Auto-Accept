/**
 * 03_clicking.js — Accept Button Clicking Logic
 */

const { SELECTORS } = require('./00_selectors');
const { log, queryAll } = require('./01_utils');

function isAcceptButton(el) {
    const text = (el.textContent || '').trim().toLowerCase();
    if (text.length === 0 || text.length > 50) return false;

    if (SELECTORS.rejectPatterns.some(r => text.includes(r))) return false;
    if (!SELECTORS.acceptPatterns.some(p => text.includes(p))) return false;

    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && rect.width > 0 && style.pointerEvents !== 'none' && !el.disabled;
}

function clickAcceptButtons(ide = 'cursor') {
    const selectors = ide === 'antigravity'
        ? [...SELECTORS.antigravityButtons, ...SELECTORS.cursorButtons]
        : [...SELECTORS.cursorButtons];

    const found = [];
    selectors.forEach(s => queryAll(s).forEach(el => found.push(el)));

    let clicked = 0;
    const uniqueFound = [...new Set(found)];

    for (const el of uniqueFound) {
        if (isAcceptButton(el)) {
            const buttonText = (el.textContent || '').trim();
            log(`Clicking: "${buttonText}"`);

            el.dispatchEvent(new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
            }));
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
