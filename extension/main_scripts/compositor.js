/**
 * compositor.js — Script Compositor
 *
 * Reads and combines module files from the modules/ directory
 * into a single injectable script string.
 */

const fs = require('fs');
const path = require('path');

const MODULES_DIR = path.join(__dirname, 'modules');

function composeScript() {
    const moduleFiles = [
        '00_selectors.js',
        '01_utils.js',
        '02_overlay.js',
        '03_clicking.js',
        '04_background_cursor.js',
        '05_background_antigravity.js',
        '06_lifecycle.js'
    ];

    const parts = [];

    for (const file of moduleFiles) {
        const filePath = path.join(MODULES_DIR, file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            parts.push(`// === ${file} ===\n${content}`);
        }
    }

    return parts.join('\n\n');
}

function getComposedScript() {
    return composeScript();
}

module.exports = { composeScript, getComposedScript };
