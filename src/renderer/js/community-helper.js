const COMMUNITY_HELP_CONFIG = {
  endpoint: 'https://eclassrecord-community-relay.jerniqz.workers.dev',
  pollIntervalMs: 5 * 60 * 1000
};

let communityHelpLastPollAt = localStorage.getItem('community_help_last_poll_at') || '';
let communityHelpPollTimer = null;

function getCommunityHelpEndpoint() {
  return COMMUNITY_HELP_CONFIG.endpoint.replace(/\/$/, '');
}

function updateCommunityHelpSettingsStatus(status, tone = '') {
  const statusEl = document.getElementById('communityRelayStatus');
  if (!statusEl) return;
  statusEl.textContent = status;
  statusEl.dataset.tone = tone;
}

function syncCommunityHelpSettings() {
  localStorage.removeItem('community_help_endpoint');
  if (!navigator.onLine) {
    updateCommunityHelpSettingsStatus('Offline', 'warning');
    return;
  }
  updateCommunityHelpSettingsStatus('Online when connected to the internet', 'success');
}

async function testCommunityHelpEndpoint() {
  if (!navigator.onLine) {
    updateCommunityHelpSettingsStatus('Offline', 'warning');
    toast('Community Help is available only when online.', 'warning');
    return { success: false, offline: true };
  }

  updateCommunityHelpSettingsStatus('Checking...', 'info');
  try {
    const response = await fetch(`${getCommunityHelpEndpoint()}/health`);
    if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
    updateCommunityHelpSettingsStatus('Online', 'success');
    startCommunityQuestionPolling();
    toast('Community Help is online.', 'success');
    return { success: true };
  } catch (err) {
    updateCommunityHelpSettingsStatus('Unavailable', 'danger');
    toast('Community Help is unavailable right now.', 'warning');
    return { success: false, error: err.message };
  }
}

function getCommunityHelpInstallId() {
  let installId = localStorage.getItem('community_help_install_id');
  if (!installId) {
    installId = `install-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem('community_help_install_id', installId);
  }
  return installId;
}

async function communityHelpPayload(question, matchedFaqId = '') {
  let appVersion = '';
  if (window.electronAPI && typeof window.electronAPI.getVersion === 'function') {
    try {
      appVersion = await window.electronAPI.getVersion();
    } catch (_err) {
      appVersion = '';
    }
  }

  return {
    question: String(question || '').slice(0, 700),
    appVersion,
    matchedFaqId: matchedFaqId || '',
    installId: getCommunityHelpInstallId(),
    timestamp: new Date().toISOString()
  };
}

async function submitCommunityQuestion(question, matchedFaqId = '') {
  if (!navigator.onLine) {
    return { success: false, offline: true, error: 'Community help is available only when online.' };
  }

  const payload = await communityHelpPayload(question, matchedFaqId);
  const response = await fetch(`${getCommunityHelpEndpoint()}/community/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Community question failed: ${response.status}`);
  }

  return { success: true, data: await response.json().catch(() => ({})) };
}

async function pollCommunityQuestions() {
  if (!navigator.onLine) return { success: false, offline: true };

  const url = new URL(`${getCommunityHelpEndpoint()}/community/questions/recent`);
  if (communityHelpLastPollAt) {
    url.searchParams.set('since', communityHelpLastPollAt);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Community poll failed: ${response.status}`);
  }

  const data = await response.json().catch(() => ({}));
  communityHelpLastPollAt = new Date().toISOString();
  localStorage.setItem('community_help_last_poll_at', communityHelpLastPollAt);

  return { success: true, questions: Array.isArray(data.questions) ? data.questions : [] };
}

async function dismissCommunityQuestion(questionId) {
  localStorage.setItem(`community_help_dismissed_${questionId}`, 'true');

  if (!navigator.onLine || !questionId) return { success: true, localOnly: true };

  await fetch(`${getCommunityHelpEndpoint()}/community/questions/${encodeURIComponent(questionId)}/dismiss`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      installId: getCommunityHelpInstallId(),
      timestamp: new Date().toISOString()
    })
  }).catch(() => null);

  return { success: true };
}

function previewCommunityQuestion(questionId) {
  const question = window.pendingCommunityHelpQuestions
    ? window.pendingCommunityHelpQuestions[String(questionId)]
    : null;

  if (question && typeof openHelpAssistantWithCommunityQuestion === 'function') {
    openHelpAssistantWithCommunityQuestion(question);
  }
}

function showCommunityQuestionToast(question) {
  if (
    !question ||
    !question.id ||
    question.installId === getCommunityHelpInstallId() ||
    localStorage.getItem(`community_help_dismissed_${question.id}`) === 'true'
  ) {
    return;
  }

  window.pendingCommunityHelpQuestions = window.pendingCommunityHelpQuestions || {};
  window.pendingCommunityHelpQuestions[String(question.id)] = question;

  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;

  const node = document.createElement('div');
  node.className = 'toast community-help-toast';
  node.innerHTML = `
    <div class="community-help-toast__text">
      <strong>A teacher asked:</strong>
      <span>${esc(String(question.question || '').slice(0, 120))}</span>
    </div>
    <div class="community-help-toast__actions">
      <button class="btn btn-primary btn-sm" type="button">Preview</button>
      <button class="btn btn-ghost btn-sm" type="button">Dismiss</button>
    </div>
  `;

  const [previewBtn, dismissBtn] = node.querySelectorAll('button');
  previewBtn.addEventListener('click', () => {
    previewCommunityQuestion(question.id);
    if (node.parentNode) node.parentNode.removeChild(node);
  });
  dismissBtn.addEventListener('click', () => {
    dismissCommunityQuestion(question.id);
    if (node.parentNode) node.parentNode.removeChild(node);
  });

  wrap.appendChild(node);
  setTimeout(() => {
    if (node.parentNode) {
      node.classList.add('toast--exit');
      setTimeout(() => node.parentNode && node.parentNode.removeChild(node), 250);
    }
  }, 14000);
}

async function checkCommunityQuestionsOnce() {
  try {
    const result = await pollCommunityQuestions();
    if (result.success) {
      result.questions.forEach(showCommunityQuestionToast);
      if (navigator.onLine) updateCommunityHelpSettingsStatus('Online when connected to the internet', 'success');
    }
  } catch (err) {
    updateCommunityHelpSettingsStatus('Unavailable', 'danger');
    console.warn('Community help polling failed:', err);
  }
}

function startCommunityQuestionPolling() {
  if (communityHelpPollTimer || !getCommunityHelpEndpoint()) return;
  checkCommunityQuestionsOnce();
  communityHelpPollTimer = setInterval(checkCommunityQuestionsOnce, COMMUNITY_HELP_CONFIG.pollIntervalMs);
}

function stopCommunityQuestionPolling() {
  if (communityHelpPollTimer) {
    clearInterval(communityHelpPollTimer);
    communityHelpPollTimer = null;
  }
}

window.addEventListener('DOMContentLoaded', syncCommunityHelpSettings);
window.addEventListener('online', syncCommunityHelpSettings);
window.addEventListener('offline', syncCommunityHelpSettings);
