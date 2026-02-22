/**
 * 01_utils.js — Utility Functions
 *
 * Cross-iframe DOM traversal, text processing, deduplication.
 */

const log = (msg) => {
    console.log(`[AutoAccept] ${msg}`);
};

const getDocuments = (root = document) => {
    let docs = [root];
    try {
        const iframes = root.querySelectorAll('iframe, frame');
        for (const iframe of iframes) {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) docs.push(...getDocuments(iframeDoc));
            } catch (e) { }
        }
    } catch (e) { }
    return docs;
};

const queryAll = (selector) => {
    const results = [];
    getDocuments().forEach(doc => {
        try { results.push(...Array.from(doc.querySelectorAll(selector))); } catch (e) { }
    });
    return results;
};

const stripTimeSuffix = (text) => {
    return (text || '').trim().replace(/\s*\d+[smh]$/, '').trim();
};

const deduplicateNames = (names) => {
    const counts = {};
    return names.map(name => {
        if (counts[name] === undefined) {
            counts[name] = 1;
            return name;
        } else {
            counts[name]++;
            return `${name} (${counts[name]})`;
        }
    });
};

module.exports = { log, getDocuments, queryAll, stripTimeSuffix, deduplicateNames };
