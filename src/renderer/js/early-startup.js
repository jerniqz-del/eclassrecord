'use strict';

const startupParameters = new URLSearchParams(location.search);
window.__ECLASS_SAFE_MODE = startupParameters.get('safeMode') === '1';
window.__ECLASS_RECOVERY_START = startupParameters.get('recovery') === '1';
if (window.__ECLASS_SAFE_MODE) {
  document.documentElement.dataset.safeMode = 'true';
  document.documentElement.dataset.performanceMode = 'low';
}

try {
  if (!window.__ECLASS_SAFE_MODE && localStorage.getItem('eclass_performance_mode_v1') === 'low') {
    document.documentElement.dataset.performanceMode = 'low';
  }
} catch (_error) {
  // Storage can be unavailable in hardened or temporary browser contexts.
}
