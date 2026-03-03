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

const queryAll = (selector, roots = [document]) => {
    const results = [];

    // Allow single root to be passed
    const rootArray = Array.isArray(roots) ? roots : [roots];

    const search = (node) => {
        if (!node) return;

        // 1. Search in current node
        try {
            if (node.querySelectorAll) {
                results.push(...Array.from(node.querySelectorAll(selector)));
            }
        } catch (e) { }

        // 2. Search in Shadow DOM
        if (node.shadowRoot) {
            search(node.shadowRoot);
        }

        // 3. Search in children for more Shadow Roots
        if (node.children) {
            for (const child of node.children) {
                search(child);
            }
        }

        // 4. Search in iframes (if this is document/iframeDoc)
        try {
            const iframes = node.querySelectorAll ? node.querySelectorAll('iframe, frame') : [];
            for (const iframe of iframes) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) search(iframeDoc);
                } catch (e) { }
            }
        } catch (e) { }
    };

    rootArray.forEach(root => search(root));
    return [...new Set(results)]; // Deduplicate
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
