/**
 * 06_lifecycle.js — Lifecycle Management
 *
 * Start/stop control and state management for the auto-accept system.
 */

const { log } = require('./01_utils');

function createState() {
    return {
        isRunning: false,
        sessionID: 0,
        clicks: 0,
        clickInterval: null,
        mode: null,
        ide: null,
        tabNames: [],
        completionStatus: {},
        _noTabCycles: 0
    };
}

function startSession(state, config) {
    if (state.isRunning) {
        log('Already running, stopping first...');
        stopSession(state);
    }

    state.isRunning = true;
    state.sessionID++;
    state.mode = config.isBackgroundMode ? 'background' : 'simple';
    state.ide = (config.ide || 'cursor').toLowerCase();
    state.tabNames = [];
    state.completionStatus = {};
    state._noTabCycles = 0;

    log(`Starting ${state.mode} mode for ${state.ide}...`);
    return state.sessionID;
}

function stopSession(state) {
    state.isRunning = false;

    if (state.clickInterval) {
        clearInterval(state.clickInterval);
        state.clickInterval = null;
    }

    log('Session stopped');
}

module.exports = { createState, startSession, stopSession };
