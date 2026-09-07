'use strict';

const fs = require('fs');
const path = require('path');

class RecoveryController {
  constructor(options = {}) {
    this.statePath = path.resolve(options.statePath);
    this.now = options.now || (() => Date.now());
    this.windowMs = Number(options.windowMs) || 5 * 60 * 1000;
    this.crashLoopThreshold = Number(options.crashLoopThreshold) || 3;
    this.maxAutomaticRecoveries = Number(options.maxAutomaticRecoveries) || 3;
    this.automaticRecoveries = 0;
  }

  read() {
    try {
      const value = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
      return { failures: Array.isArray(value.failures) ? value.failures.filter(Number.isFinite) : [] };
    } catch (_error) {
      return { failures: [] };
    }
  }

  write(state) {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temporary, this.statePath);
  }

  recordFailure(category) {
    const now = this.now();
    const state = this.read();
    state.failures = state.failures.filter(timestamp => timestamp > now - this.windowMs);
    state.failures.push(now);
    this.write(state);
    this.automaticRecoveries += 1;
    return {
      category: String(category || 'renderer-failure').slice(0, 80),
      count: state.failures.length,
      safeMode: state.failures.length >= this.crashLoopThreshold,
      mayReload: this.automaticRecoveries <= this.maxAutomaticRecoveries
    };
  }

  markStable() {
    this.automaticRecoveries = 0;
    this.write({ failures: [] });
  }
}

module.exports = { RecoveryController };
