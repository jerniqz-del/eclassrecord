(function initCloudGradePilot(globalScope) {
  'use strict';

  const CONFIG_KEY = 'cloudGradePilot';
  const ENVELOPE_ALGORITHM = 'ECDH-P256/AES-256-GCM';

  function activeDb() {
    return typeof globalScope.getActiveProfileDatabase === 'function'
      ? globalScope.getActiveProfileDatabase()
      : globalScope.db;
  }

  function config(create = false) {
    const profile = activeDb();
    if (!profile) return null;
    if (create && (!profile[CONFIG_KEY] || typeof profile[CONFIG_KEY] !== 'object')) profile[CONFIG_KEY] = {};
    return profile[CONFIG_KEY] || null;
  }

  function clean(value, max = 160) {
    return String(value || '').trim().slice(0, max);
  }

  function normalizeEndpoint(value) {
    const raw = clean(value, 500).replace(/\/+$/, '');
    let parsed;
    try { parsed = new URL(raw); } catch (_error) { throw new Error('Enter the Cloudflare Worker address provided by ICT.'); }
    const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) {
      throw new Error('The school connection must use a secure HTTPS address.');
    }
    return parsed.toString().replace(/\/$/, '');
  }

  function bytesToBase64(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (let offset = 0; offset < view.length; offset += 32768) {
      binary += String.fromCharCode(...view.subarray(offset, offset + 32768));
    }
    return globalScope.btoa ? globalScope.btoa(binary) : Buffer.from(view).toString('base64');
  }

  function base64ToBytes(value) {
    const binary = globalScope.atob ? globalScope.atob(String(value)) : Buffer.from(String(value), 'base64').toString('binary');
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  }

  async function request(path, options = {}) {
    const current = config();
    const endpoint = normalizeEndpoint(options.endpoint || current?.endpoint);
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (!options.anonymous) {
      if (!current?.token) throw new Error('Connect this profile to the school grade service first.');
      headers.Authorization = `Bearer ${current.token}`;
    }
    let response;
    try {
      response = await globalScope.fetch(`${endpoint}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    } catch (_error) {
      throw new Error('The school grade service could not be reached. Check the internet connection and Worker address.');
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `School grade service returned ${response.status}.`);
    return payload;
  }

  async function createDeviceKeys() {
    if (!globalScope.crypto?.subtle) throw new Error('Secure device encryption is unavailable.');
    const keyPair = await globalScope.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    return {
      publicKey: await globalScope.crypto.subtle.exportKey('jwk', keyPair.publicKey),
      privateKey: await globalScope.crypto.subtle.exportKey('jwk', keyPair.privateKey)
    };
  }

  async function activate(endpoint, activationCode) {
    const normalizedEndpoint = normalizeEndpoint(endpoint);
    const keys = await createDeviceKeys();
    const result = await request('/v1/activate', {
      endpoint: normalizedEndpoint,
      anonymous: true,
      method: 'POST',
      body: { activationCode: clean(activationCode, 40), publicKey: keys.publicKey }
    });
    Object.assign(config(true), {
      endpoint: normalizedEndpoint,
      token: result.token,
      tokenExpiresAt: result.expiresAt,
      user: result.user,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      connectedAt: new Date().toISOString()
    });
    await globalScope.saveDatabase?.();
    renderSettings();
    return result.user;
  }

  async function testConnection() {
    const result = await request('/v1/me');
    config(true).user = result.user;
    config(true).lastCheckedAt = new Date().toISOString();
    await globalScope.saveDatabase?.();
    renderSettings();
    return result.user;
  }

  async function disconnect() {
    const profile = activeDb();
    if (profile) delete profile[CONFIG_KEY];
    await globalScope.saveDatabase?.();
    renderSettings();
  }

  function isConnected(role) {
    const current = config();
    return Boolean(current?.endpoint && current?.token && current?.privateKey
      && (!role || current.user?.role === role || current.user?.role === 'ict-admin'));
  }

  async function encryptPayload(payload, recipientPublicKey) {
    const recipient = await globalScope.crypto.subtle.importKey('jwk', recipientPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ephemeral = await globalScope.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const aesKey = await globalScope.crypto.subtle.deriveKey(
      { name: 'ECDH', public: recipient }, ephemeral.privateKey,
      { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const iv = globalScope.crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = await globalScope.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, plaintext);
    return {
      algorithm: ENVELOPE_ALGORITHM,
      ephemeralPublicKey: await globalScope.crypto.subtle.exportKey('jwk', ephemeral.publicKey),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext)
    };
  }

  async function decryptPayload(envelope) {
    const current = config();
    if (!current?.privateKey) throw new Error('This profile does not have the device key needed to open the submission.');
    if (envelope?.algorithm !== ENVELOPE_ALGORITHM) throw new Error('Unsupported encrypted grade submission.');
    const privateKey = await globalScope.crypto.subtle.importKey('jwk', current.privateKey, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
    const ephemeral = await globalScope.crypto.subtle.importKey('jwk', envelope.ephemeralPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const aesKey = await globalScope.crypto.subtle.deriveKey(
      { name: 'ECDH', public: ephemeral }, privateKey,
      { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    let plaintext;
    try {
      plaintext = await globalScope.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, aesKey, base64ToBytes(envelope.ciphertext)
      );
    } catch (_error) {
      throw new Error('This submission could not be decrypted on this adviser profile.');
    }
    try { return JSON.parse(new TextDecoder().decode(plaintext)); }
    catch (_error) { throw new Error('The decrypted submission is not a valid Grade Transfer File.'); }
  }

  async function listRecipients(payload) {
    const query = new URLSearchParams({
      schoolYear: clean(payload.schoolYear, 20),
      gradeLevel: clean(payload.class?.gradeLevel, 30),
      section: clean(payload.class?.section, 80)
    });
    return (await request(`/v1/recipients?${query}`)).recipients || [];
  }

  function chooseRecipient(recipients, payload) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay advisory-nested-modal';
      overlay.innerHTML = `<div class="modal"><div class="modal__title">Submit Final Grades</div><div class="modal__body"><div class="advisory-transfer-summary"><strong>${globalScope.esc(payload.subject?.name || 'Subject')} &middot; Term ${globalScope.esc(payload.term?.number || '')}</strong><span>Grade ${globalScope.esc(payload.class?.gradeLevel || '')} - ${globalScope.esc(payload.class?.section || '')} &middot; ${payload.learners?.length || 0} learners</span></div><div class="field"><label class="field-label" for="cloudGradeRecipient">Class Adviser</label><select class="field-select" id="cloudGradeRecipient">${recipients.map(item => `<option value="${globalScope.esc(item.id)}">${globalScope.esc(item.displayName)}</option>`).join('')}</select></div><p class="settings-row__desc">Only the selected adviser profile can decrypt this submission.</p></div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-cancel>Cancel</button><button class="btn btn-primary btn-sm" data-submit>Submit Securely</button></div></div>`;
      document.body.appendChild(overlay);
      overlay.querySelector('[data-cancel]').addEventListener('click', () => { overlay.remove(); resolve(null); });
      overlay.querySelector('[data-submit]').addEventListener('click', () => {
        const selected = recipients.find(item => item.id === overlay.querySelector('#cloudGradeRecipient').value) || null;
        overlay.remove();
        resolve(selected);
      });
    });
  }

  async function submitGradePayload(payload) {
    if (!isConnected()) throw new Error('Connect this profile to the school grade service in Settings first.');
    if (!['subject-teacher', 'ict-admin'].includes(config().user?.role)) throw new Error('This school account is not registered as a subject teacher.');
    const validation = globalScope.AdvisoryGradeTransfer?.validatePayload?.(payload);
    if (!validation?.isValid) throw new Error(validation?.errors?.[0] || 'The grade submission is invalid.');
    const recipients = await listRecipients(payload);
    if (!recipients.length) throw new Error('No activated adviser is assigned to this school year, grade level, and section.');
    const recipient = await chooseRecipient(recipients, payload);
    if (!recipient) return { cancelled: true };
    const envelope = await encryptPayload(payload, recipient.publicKey);
    const result = await request('/v1/submissions', {
      method: 'POST',
      body: {
        recipientUserId: recipient.id,
        exportId: payload.exportId,
        schoolYear: payload.schoolYear,
        gradeLevel: payload.class.gradeLevel,
        section: payload.class.section,
        subjectName: payload.subject.name,
        subjectKey: payload.subject.normalizedKey,
        term: payload.term.number,
        learnerCount: payload.learners.length,
        envelope
      }
    });
    globalScope.toast?.(`Grades submitted securely to ${recipient.displayName}.`, 'success');
    return result;
  }

  async function listInbox(advisoryClass) {
    const query = new URLSearchParams({
      schoolYear: clean(advisoryClass.schoolYear, 20),
      gradeLevel: clean(advisoryClass.gradeLevel, 30),
      section: clean(advisoryClass.section, 80)
    });
    return (await request(`/v1/submissions/inbox?${query}`)).submissions || [];
  }

  async function openSubmission(submission) {
    const result = await request(`/v1/submissions/${encodeURIComponent(submission.id)}`);
    return decryptPayload(result.submission.envelope);
  }

  async function acknowledge(submissionId, status, note = '') {
    return request(`/v1/submissions/${encodeURIComponent(submissionId)}/acknowledge`, {
      method: 'POST', body: { status, note: clean(note, 300) }
    });
  }

  async function showInbox(advisoryClass) {
    if (!isConnected()) throw new Error('Connect this adviser profile to the school grade service in Settings first.');
    const submissions = await listInbox(advisoryClass);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay advisory-nested-modal';
    overlay.innerHTML = `<div class="modal modal--wide cloud-grade-inbox"><div class="modal__title">Online Grade Inbox</div><div class="modal__body advisory-scroll-body">${submissions.length ? `<div class="cloud-grade-inbox__list">${submissions.map(item => `<div class="cloud-grade-inbox__item"><span><strong>${globalScope.esc(item.subjectName)} &middot; Term ${globalScope.esc(item.term)}</strong><small>${globalScope.esc(item.senderName)} &middot; ${globalScope.esc(item.learnerCount)} learners &middot; ${globalScope.esc(new Date(item.createdAt).toLocaleString())}</small></span><button class="btn btn-primary btn-sm" type="button" data-open-submission="${globalScope.esc(item.id)}">Review</button></div>`).join('')}</div>` : '<div class="advisory-roster__empty">No pending online grade submissions for this Advisory Class.</div>'}</div><div class="modal__actions"><button class="btn btn-cancel btn-sm" data-close>Close</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close]').addEventListener('click', () => overlay.remove());
    overlay.querySelectorAll('[data-open-submission]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const submission = submissions.find(item => item.id === button.dataset.openSubmission);
        const payload = await openSubmission(submission);
        overlay.remove();
        globalScope.AdvisoryGradeTransfer.openOnlineSubmission(payload, submission);
      } catch (error) {
        globalScope.toast?.(error.message || 'The online submission could not be opened.', 'error');
        button.disabled = false;
      }
    }));
  }

  function renderSettings() {
    const status = document.getElementById('cloudGradeStatus');
    const endpoint = document.getElementById('cloudGradeEndpoint');
    const activation = document.getElementById('cloudGradeActivationCode');
    const connectButton = document.getElementById('btnCloudGradeConnect');
    const testButton = document.getElementById('btnCloudGradeTest');
    const disconnectButton = document.getElementById('btnCloudGradeDisconnect');
    if (!status || !endpoint) return;
    const current = config();
    endpoint.value = current?.endpoint || endpoint.value || '';
    const connected = isConnected();
    status.textContent = connected
      ? `Connected as ${current.user?.displayName || 'school user'} (${String(current.user?.role || '').replace('-', ' ')}).`
      : 'Not connected. Ask the ICT Coordinator for the school Worker address and your one-time activation code.';
    endpoint.disabled = connected;
    if (activation) { activation.hidden = connected; if (connected) activation.value = ''; }
    if (connectButton) connectButton.hidden = connected;
    if (testButton) testButton.hidden = !connected;
    if (disconnectButton) disconnectButton.hidden = !connected;
  }

  function init() {
    const connectButton = document.getElementById('btnCloudGradeConnect');
    if (!connectButton || connectButton.dataset.bound === 'true') { renderSettings(); return; }
    connectButton.dataset.bound = 'true';
    connectButton.addEventListener('click', async () => {
      connectButton.disabled = true;
      try {
        const user = await activate(document.getElementById('cloudGradeEndpoint').value, document.getElementById('cloudGradeActivationCode').value);
        globalScope.toast?.(`School grade service connected for ${user.displayName}.`, 'success');
      } catch (error) { globalScope.toast?.(error.message || 'Connection failed.', 'error'); }
      finally { connectButton.disabled = false; }
    });
    document.getElementById('btnCloudGradeTest')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { const user = await testConnection(); globalScope.toast?.(`Connection verified for ${user.displayName}.`, 'success'); }
      catch (error) { globalScope.toast?.(error.message || 'Connection test failed.', 'error'); }
      finally { event.currentTarget.disabled = false; }
    });
    document.getElementById('btnCloudGradeDisconnect')?.addEventListener('click', () => {
      globalScope.confirmModal?.('Disconnect School Grade Service', 'Remove this profile connection and its device key? A new activation code from ICT will be required to reconnect.', async () => {
        await disconnect();
        globalScope.toast?.('School grade service disconnected.', 'success');
      });
    });
    document.getElementById('navSettings')?.addEventListener('click', () => setTimeout(renderSettings, 0));
    renderSettings();
  }

  const api = {
    ENVELOPE_ALGORITHM,
    normalizeEndpoint,
    createDeviceKeys,
    encryptPayload,
    decryptPayload,
    activate,
    testConnection,
    disconnect,
    isConnected,
    submitGradePayload,
    listInbox,
    openSubmission,
    acknowledge,
    showInbox,
    renderSettings,
    init
  };
  globalScope.CloudGradePilot = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
