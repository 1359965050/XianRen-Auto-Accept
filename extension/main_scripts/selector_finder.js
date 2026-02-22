/**
 * selector_finder.js — Runtime Selector Probe
 *
 * Probes the current DOM to determine which CSS selectors are active
 * and returns the best matching selectors for the current IDE environment.
 */

const { SELECTORS } = require('./modules/00_selectors');

function findWorkingTabSelector(queryAll) {
    for (const selector of SELECTORS.cursorTabs) {
        const results = queryAll(selector);
        if (results.length > 0) {
            return { selector, count: results.length, type: 'cursor' };
        }
    }

    const antigravityTabs = queryAll(SELECTORS.antigravityTabs);
    if (antigravityTabs.length > 0) {
        return { selector: SELECTORS.antigravityTabs, count: antigravityTabs.length, type: 'antigravity' };
    }

    return null;
}

function findWorkingButtonSelector(queryAll) {
    const allSelectors = [...SELECTORS.antigravityButtons, ...SELECTORS.cursorButtons];
    const results = {};

    for (const selector of allSelectors) {
        const elements = queryAll(selector);
        if (elements.length > 0) {
            results[selector] = elements.length;
        }
    }

    return results;
}

function findPanelElement(queryAll) {
    for (const selector of SELECTORS.panels) {
        const found = queryAll(selector);
        const visible = found.find(p => p.offsetWidth > 50);
        if (visible) {
            return { selector, element: visible };
        }
    }
    return null;
}

module.exports = { findWorkingTabSelector, findWorkingButtonSelector, findPanelElement };
