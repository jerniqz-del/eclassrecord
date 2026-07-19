const SIDEBAR_AD_PLACEMENT = 'sidebar-sponsor';
const SIDEBAR_AD_ROTATION_MS = 5000;
const SIDEBAR_AD_REMOTE_REFRESH_MS = 30 * 60 * 1000;
const SIDEBAR_AD_PREVIEW_CACHE_KEY = 'sidebar_ad_preview_cache_v1';
const SIDEBAR_AD_REMOTE_CACHE_KEY = 'sidebar_ad_remote_cache_v1';
const SIDEBAR_AD_PREVIEW_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SIDEBAR_AD_ENDPOINT_FALLBACK = 'https://eclassrecord-community-relay.jerniqz.workers.dev';

const HOUSE_SIDEBAR_ADS = [
  {
    placementId: SIDEBAR_AD_PLACEMENT,
    title: 'Support E-Class Record',
    body: 'Help keep teacher-focused updates, fixes, and offline tools moving forward.',
    imageUrl: '',
    clickUrl: 'https://ko-fi.com/jerniqz',
    label: 'Sponsored',
    provider: 'house'
  },
  {
    placementId: SIDEBAR_AD_PLACEMENT,
    title: 'Latest E-Class Record releases',
    body: 'Review the newest improvements, fixes, and release notes for teachers.',
    imageUrl: '',
    clickUrl: 'https://github.com/jerniqz-del/eclassrecord/releases',
    label: 'Sponsored',
    provider: 'house'
  },
  {
    placementId: SIDEBAR_AD_PLACEMENT,
    title: 'TeacherBook on Facebook',
    body: 'Follow updates, guides, and support posts for classroom record keeping.',
    imageUrl: '',
    clickUrl: 'https://www.facebook.com/',
    label: 'Sponsored',
    provider: 'house'
  }
];

const sidebarAdState = {
  ads: [],
  activeIndex: 0,
  timerId: null,
  remoteRefreshTimerId: null,
  paused: false,
  ownerUnlocked: false,
  ownerModalCanSave: false,
  ownerAdminToken: '',
  ownerToolsInitialized: false
};

function sidebarAdEsc(value) {
  if (typeof esc === 'function') return esc(value);
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function getSidebarAdEndpoint() {
  if (typeof getCommunityHelpEndpoint === 'function') {
    return getCommunityHelpEndpoint().replace(/\/$/, '');
  }
  return SIDEBAR_AD_ENDPOINT_FALLBACK;
}

function normalizeSidebarAd(ad) {
  if (!ad || typeof ad !== 'object') return null;
  const clickUrl = String(ad.clickUrl || '').trim().slice(0, 500);
  const imageUrl = String(ad.imageUrl || '').trim().slice(0, 500);
  const previewImageUrl = String(ad.previewImageUrl || '').trim().slice(0, 500);
  const normalized = {
    placementId: String(ad.placementId || SIDEBAR_AD_PLACEMENT).trim().slice(0, 80),
    title: String(ad.title || '').trim().slice(0, 120),
    body: String(ad.body || '').trim().slice(0, 220),
    imageUrl: imageUrl && isPreviewableUrl(imageUrl) ? imageUrl : '',
    clickUrl: clickUrl && isPreviewableUrl(clickUrl) ? clickUrl : '',
    label: String(ad.label || 'Sponsored').trim().slice(0, 40),
    provider: String(ad.provider || 'local').trim().slice(0, 40),
    previewTitle: String(ad.previewTitle || '').trim().slice(0, 120),
    previewDescription: String(ad.previewDescription || '').trim().slice(0, 220),
    previewImageUrl: previewImageUrl && isPreviewableUrl(previewImageUrl) ? previewImageUrl : ''
  };
  return normalized.title ? normalized : null;
}

function normalizeSidebarAds(ads) {
  return (Array.isArray(ads) ? ads : [ads])
    .slice(0, 8)
    .map(normalizeSidebarAd)
    .filter(Boolean);
}

function getBundledSidebarAds() {
  return normalizeSidebarAds(HOUSE_SIDEBAR_ADS);
}

function getCachedRemoteSidebarAds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SIDEBAR_AD_REMOTE_CACHE_KEY) || '{}');
    return normalizeSidebarAds(parsed.ads || parsed);
  } catch (err) {
    return [];
  }
}

function cacheRemoteSidebarAds(ads, version = '') {
  const normalized = normalizeSidebarAds(ads);
  if (!normalized.length) return [];
  try {
    localStorage.setItem(SIDEBAR_AD_REMOTE_CACHE_KEY, JSON.stringify({
      version: String(version || ''),
      cachedAt: new Date().toISOString(),
      ads: normalized
    }));
  } catch (err) {
    // Rendering must not depend on localStorage availability.
  }
  return normalized;
}

function getSidebarAds() {
  const cachedRemoteAds = getCachedRemoteSidebarAds();
  if (cachedRemoteAds.length) return cachedRemoteAds;

  try {
    const provider = window.sidebarAdProvider;
    if (provider && typeof provider.getSidebarAds === 'function') {
      const ads = normalizeSidebarAds(provider.getSidebarAds());
      if (ads.length) return ads;
    }
    if (provider && typeof provider.getSidebarAd === 'function') {
      const ad = normalizeSidebarAd(provider.getSidebarAd());
      if (ad) return [ad];
    }
  } catch (err) {
    console.warn('Sidebar ad provider failed, using house ads.', err);
  }
  return getBundledSidebarAds();
}

function getSidebarAd() {
  return getSidebarAds()[0] || null;
}

function trackAdImpression(ad) {}

function trackAdClick(ad) {}

function isPreviewableUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

function getAdHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (err) {
    return '';
  }
}

function readAdPreviewCache() {
  try {
    return JSON.parse(localStorage.getItem(SIDEBAR_AD_PREVIEW_CACHE_KEY) || '{}');
  } catch (err) {
    return {};
  }
}

function writeAdPreviewCache(cache) {
  try {
    localStorage.setItem(SIDEBAR_AD_PREVIEW_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    // Cache failure should not affect ad rendering.
  }
}

function getCachedAdPreview(url) {
  const cache = readAdPreviewCache();
  const entry = cache[url];
  if (!entry || !entry.preview || !entry.cachedAt) return null;
  if (Date.now() - Number(entry.cachedAt) > SIDEBAR_AD_PREVIEW_CACHE_TTL_MS) return null;
  return entry.preview;
}

function cacheAdPreview(url, preview) {
  if (!url || !preview) return;
  const cache = readAdPreviewCache();
  cache[url] = {
    cachedAt: Date.now(),
    preview
  };
  writeAdPreviewCache(cache);
}

function applyAdPreview(ad, preview) {
  if (!ad || !preview) return ad;
  return normalizeSidebarAd({
    ...ad,
    previewTitle: preview.title || ad.previewTitle,
    previewDescription: preview.description || ad.previewDescription,
    previewImageUrl: preview.imageUrl || ad.previewImageUrl
  }) || ad;
}

function getAdDisplayTitle(ad) {
  return ad.previewTitle || ad.title || getAdHostname(ad.clickUrl) || 'Sponsored message';
}

function getAdDisplayBody(ad) {
  return ad.previewDescription || ad.body || getAdHostname(ad.clickUrl);
}

function getAdDisplayImage(ad) {
  return ad.previewImageUrl || ad.imageUrl || '';
}

function getAdInitial(ad) {
  const title = getAdDisplayTitle(ad);
  return title ? title.slice(0, 1).toUpperCase() : '$';
}

function openSidebarAd(ad) {
  if (!ad || !ad.clickUrl) return;
  trackAdClick(ad);
  if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
    window.electronAPI.openExternal(ad.clickUrl);
    return;
  }
  window.open(ad.clickUrl, '_blank', 'noopener,noreferrer');
}

function clearSidebarAdRotation() {
  if (sidebarAdState.timerId) {
    clearInterval(sidebarAdState.timerId);
    sidebarAdState.timerId = null;
  }
}

function isSidebarAdLowSpecMode() {
  return window.PerformanceMode?.isLowSpec?.()
    || document.documentElement?.dataset?.performanceMode === 'low';
}

function isSidebarAdRotationPaused() {
  return sidebarAdState.paused || document.body.classList.contains('sidebar--collapsed');
}

function showSidebarAdIndex(index) {
  const ads = sidebarAdState.ads;
  if (!ads.length) return;
  sidebarAdState.activeIndex = ((index % ads.length) + ads.length) % ads.length;
  const slot = document.getElementById('sidebarAdSlot');
  const track = slot && slot.querySelector('.sidebar-ad__track');
  if (track) {
    track.style.transform = `translateX(-${sidebarAdState.activeIndex * 100}%)`;
  }
  if (slot) {
    const activeAd = ads[sidebarAdState.activeIndex];
    slot.title = `${activeAd.label || 'Sponsored'}: ${getAdDisplayTitle(activeAd)}`;
    Array.from(slot.querySelectorAll('.sidebar-ad__dot')).forEach((dot, dotIndex) => {
      dot.classList.toggle('is-active', dotIndex === sidebarAdState.activeIndex);
    });
  }
  trackAdImpression(ads[sidebarAdState.activeIndex]);
}

function startSidebarAdRotation() {
  clearSidebarAdRotation();
  if (isSidebarAdLowSpecMode()) return;
  if (sidebarAdState.ads.length <= 1) return;
  sidebarAdState.timerId = setInterval(() => {
    if (!isSidebarAdRotationPaused()) {
      showSidebarAdIndex(sidebarAdState.activeIndex + 1);
    }
  }, SIDEBAR_AD_ROTATION_MS);
}

function renderSidebarAdCard(ad, index) {
  const isClickable = Boolean(ad.clickUrl);
  const imageUrl = getAdDisplayImage(ad);
  const imageHtml = imageUrl
    ? `<img class="sidebar-ad__image" src="${sidebarAdEsc(imageUrl)}" alt="" loading="lazy">`
    : `<span class="sidebar-ad__icon" aria-hidden="true">${sidebarAdEsc(getAdInitial(ad))}</span>`;
  const body = getAdDisplayBody(ad);

  return `
    <button class="sidebar-ad__surface" type="button" data-sidebar-ad-index="${index}" ${isClickable ? '' : 'disabled'}>
      <span class="sidebar-ad__label">${sidebarAdEsc(ad.label || 'Sponsored')}</span>
      <span class="sidebar-ad__media">${imageHtml}</span>
      <span class="sidebar-ad__content">
        <strong class="sidebar-ad__title">${sidebarAdEsc(getAdDisplayTitle(ad))}</strong>
        ${body ? `<span class="sidebar-ad__body">${sidebarAdEsc(body)}</span>` : ''}
      </span>
    </button>
  `;
}

function renderSidebarAd(adOrAds) {
  const slot = document.getElementById('sidebarAdSlot');
  if (!slot) return;

  clearSidebarAdRotation();
  const normalizedAds = normalizeSidebarAds(adOrAds);
  const ads = isSidebarAdLowSpecMode() ? normalizedAds.slice(0, 1) : normalizedAds;
  if (!ads.length) {
    slot.innerHTML = '';
    return;
  }

  sidebarAdState.ads = ads;
  sidebarAdState.activeIndex = Math.min(sidebarAdState.activeIndex, ads.length - 1);
  slot.className = 'sidebar-ad';
  slot.setAttribute('aria-label', 'Sponsored message');

  const collapsedAd = ads[sidebarAdState.activeIndex] || ads[0];
  const dotsHtml = ads.length > 1
    ? `<div class="sidebar-ad__dots" aria-hidden="true">${ads.map((_, index) => `<span class="sidebar-ad__dot${index === sidebarAdState.activeIndex ? ' is-active' : ''}"></span>`).join('')}</div>`
    : '';

  slot.innerHTML = `
    <div class="sidebar-ad__viewport">
      <div class="sidebar-ad__track">
        ${ads.map(renderSidebarAdCard).join('')}
      </div>
    </div>
    ${dotsHtml}
    <button class="sidebar-ad__collapsed-surface" type="button" title="Sponsored" aria-label="Sponsored message" ${collapsedAd.clickUrl ? '' : 'disabled'}>
      <span class="sidebar-ad__collapsed-label" aria-hidden="true">Ad</span>
    </button>
  `;

  slot.addEventListener('mouseenter', () => { sidebarAdState.paused = true; });
  slot.addEventListener('mouseleave', () => { sidebarAdState.paused = false; });
  slot.addEventListener('focusin', () => { sidebarAdState.paused = true; });
  slot.addEventListener('focusout', () => { sidebarAdState.paused = false; });

  slot.querySelectorAll('.sidebar-ad__surface').forEach((surface) => {
    surface.addEventListener('click', () => {
      const index = Number(surface.getAttribute('data-sidebar-ad-index'));
      openSidebarAd(ads[index]);
    });
  });

  const collapsedSurface = slot.querySelector('.sidebar-ad__collapsed-surface');
  if (collapsedSurface) {
    collapsedSurface.addEventListener('click', () => openSidebarAd(sidebarAdState.ads[sidebarAdState.activeIndex]));
  }

  showSidebarAdIndex(sidebarAdState.activeIndex);
  startSidebarAdRotation();
}

async function fetchRemoteSidebarAds() {
  if (!navigator.onLine) return { success: false, offline: true };
  const response = await fetch(`${getSidebarAdEndpoint()}/ads/sidebar`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Sidebar ads failed: ${response.status}`);
  const data = await response.json().catch(() => ({}));
  const ads = normalizeSidebarAds(data.ads);
  return {
    success: true,
    version: data.version || '',
    updatedAt: data.updatedAt || '',
    ads
  };
}

async function refreshRemoteSidebarAds({ render = true } = {}) {
  try {
    const result = await fetchRemoteSidebarAds();
    if (!result.success) return result;
    const ads = result.ads.length ? cacheRemoteSidebarAds(result.ads, result.version) : [];
    if (render && ads.length) {
      renderSidebarAd(ads);
      refreshSidebarAdPreviews();
    }
    return { ...result, ads };
  } catch (err) {
    return { success: false, error: err.message || 'Remote sidebar ads unavailable.' };
  }
}

function startSidebarAdRemoteRefresh() {
  if (isSidebarAdLowSpecMode()) return;
  if (sidebarAdState.remoteRefreshTimerId) return;
  sidebarAdState.remoteRefreshTimerId = setInterval(() => {
    refreshRemoteSidebarAds({ render: true });
  }, SIDEBAR_AD_REMOTE_REFRESH_MS);
}

function clearSidebarAdRemoteRefresh() {
  if (sidebarAdState.remoteRefreshTimerId) {
    clearInterval(sidebarAdState.remoteRefreshTimerId);
    sidebarAdState.remoteRefreshTimerId = null;
  }
}

function setSidebarAdLowSpecMode(enabled) {
  clearSidebarAdRotation();
  clearSidebarAdRemoteRefresh();
  renderSidebarAd(getSidebarAds());
  if (!enabled) {
    refreshSidebarAdPreviews();
    startSidebarAdRemoteRefresh();
  }
}

function isSidebarAdOwnerToolsEnabled() {
  return sidebarAdState.ownerUnlocked || window.ECLASSRECORD_OWNER_BUILD === true;
}

function ownerAdInputValue(row, field) {
  return row.querySelector(`[data-owner-ad-field="${field}"]`)?.value.trim() || '';
}

function ownerAdRowTemplate(ad = {}) {
  return `
    <div class="owner-sidebar-ad-row">
      <div class="field">
        <label class="field-label">Title</label>
        <input class="field-input" data-owner-ad-field="title" value="${sidebarAdEsc(ad.title || '')}" placeholder="Sponsor title" />
      </div>
      <div class="field">
        <label class="field-label">Link</label>
        <input class="field-input" data-owner-ad-field="clickUrl" value="${sidebarAdEsc(ad.clickUrl || '')}" placeholder="https://example.com" />
      </div>
      <button class="btn btn-ghost btn-sm owner-sidebar-ad-remove" type="button" onclick="removeOwnerSidebarAdRow(this)" title="Remove link">&times;</button>
      <div class="field owner-sidebar-ad-row--wide">
        <label class="field-label">Description</label>
        <input class="field-input" data-owner-ad-field="body" value="${sidebarAdEsc(ad.body || '')}" placeholder="Short sponsor message" />
      </div>
      <div class="field">
        <label class="field-label">Image URL</label>
        <input class="field-input" data-owner-ad-field="imageUrl" value="${sidebarAdEsc(ad.imageUrl || '')}" placeholder="Optional" />
      </div>
    </div>
  `;
}

function setOwnerSidebarAdsStatus(message, type = 'info') {
  const status = document.getElementById('ownerSidebarAdsStatus');
  if (!status) return;
  status.textContent = message || '';
  status.style.color = type === 'error'
    ? 'var(--color-error-600)'
    : type === 'success'
      ? 'var(--color-success-700)'
      : 'var(--text-secondary)';
}

function updateOwnerSidebarAdsSaveState(canSave) {
  sidebarAdState.ownerModalCanSave = Boolean(canSave);
  const saveBtn = document.getElementById('ownerSidebarAdsSaveBtn');
  if (saveBtn) saveBtn.disabled = !sidebarAdState.ownerModalCanSave;
}

async function showSidebarAdOwnerModal() {
  if (!isSidebarAdOwnerToolsEnabled()) return;
  const list = document.getElementById('ownerSidebarAdsList');
  const tokenInput = document.getElementById('ownerSidebarAdsToken');
  if (!list) return;

  showEl('ownerSidebarAdsModal', true, 'flex');
  if (tokenInput) tokenInput.value = sidebarAdState.ownerAdminToken;
  list.innerHTML = getSidebarAds().map(ownerAdRowTemplate).join('');
  setOwnerSidebarAdsStatus('Loading global sidebar ads...', 'info');
  updateOwnerSidebarAdsSaveState(false);

  const result = await refreshRemoteSidebarAds({ render: false });
  if (result.success) {
    const ads = result.ads.length ? result.ads : getBundledSidebarAds();
    list.innerHTML = ads.map(ownerAdRowTemplate).join('');
    const message = result.ads.length
      ? 'Global sidebar ads loaded. Enter the admin token to save changes.'
      : 'Global ad service is online. No global ads are saved yet; showing bundled defaults.';
    setOwnerSidebarAdsStatus(message, 'success');
    updateOwnerSidebarAdsSaveState(true);
    return;
  }

  const fallbackAds = getCachedRemoteSidebarAds();
  list.innerHTML = (fallbackAds.length ? fallbackAds : getBundledSidebarAds()).map(ownerAdRowTemplate).join('');
  const message = !navigator.onLine
    ? 'Offline. Global save is disabled; showing cached or bundled ads.'
    : 'Global ad service is unavailable. Save is disabled; showing cached or bundled ads.';
  setOwnerSidebarAdsStatus(message, 'error');
  updateOwnerSidebarAdsSaveState(false);
}

function closeSidebarAdOwnerModal() {
  const tokenInput = document.getElementById('ownerSidebarAdsToken');
  if (tokenInput) sidebarAdState.ownerAdminToken = tokenInput.value.trim();
  showEl('ownerSidebarAdsModal', false);
}

function addOwnerSidebarAdRow() {
  const list = document.getElementById('ownerSidebarAdsList');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', ownerAdRowTemplate({
    placementId: SIDEBAR_AD_PLACEMENT,
    label: 'Sponsored',
    provider: 'owner'
  }));
}

function removeOwnerSidebarAdRow(button) {
  const row = button && button.closest('.owner-sidebar-ad-row');
  if (row) row.remove();
}

function collectOwnerSidebarAds() {
  const rows = Array.from(document.querySelectorAll('#ownerSidebarAdsList .owner-sidebar-ad-row'));
  return rows.map((row, index) => normalizeSidebarAd({
    placementId: `${SIDEBAR_AD_PLACEMENT}-${index + 1}`,
    title: ownerAdInputValue(row, 'title'),
    body: ownerAdInputValue(row, 'body'),
    imageUrl: ownerAdInputValue(row, 'imageUrl'),
    clickUrl: ownerAdInputValue(row, 'clickUrl'),
    label: 'Sponsored',
    provider: 'owner'
  })).filter(Boolean);
}

function validateOwnerSidebarAds(ads) {
  if (!ads.length) return 'Add at least one ad with a title.';
  if (ads.length > 8) return 'Use 8 ads or fewer.';
  if (ads.find(ad => !ad.title)) return 'Each ad needs a title.';
  if (ads.find(ad => !ad.clickUrl || !isPreviewableUrl(ad.clickUrl))) {
    return 'Each ad needs a link that starts with http:// or https://.';
  }
  if (ads.find(ad => ad.imageUrl && !isPreviewableUrl(ad.imageUrl))) {
    return 'Image URLs must start with http:// or https://.';
  }
  return '';
}

async function putOwnerSidebarAds(ads, token) {
  const response = await fetch(`${getSidebarAdEndpoint()}/admin/sidebar-ads`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      ads,
      updatedAt: new Date().toISOString()
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Save failed: ${response.status}`);
  }
  return data;
}

async function saveOwnerSidebarAds() {
  if (!sidebarAdState.ownerModalCanSave) {
    setOwnerSidebarAdsStatus('Global save is unavailable right now.', 'error');
    return;
  }

  const tokenInput = document.getElementById('ownerSidebarAdsToken');
  const token = tokenInput ? tokenInput.value.trim() : '';
  if (!token) {
    setOwnerSidebarAdsStatus('Enter the admin token before saving.', 'error');
    return;
  }

  const ads = collectOwnerSidebarAds();
  const validationError = validateOwnerSidebarAds(ads);
  if (validationError) {
    setOwnerSidebarAdsStatus(validationError, 'error');
    return;
  }

  updateOwnerSidebarAdsSaveState(false);
  setOwnerSidebarAdsStatus('Saving global sidebar ads...', 'info');

  try {
    const data = await putOwnerSidebarAds(ads, token);
    sidebarAdState.ownerAdminToken = token;
    const savedAds = cacheRemoteSidebarAds(data.ads || ads, data.version);
    renderSidebarAd(savedAds);
    refreshSidebarAdPreviews();
    setOwnerSidebarAdsStatus('Global sidebar ads saved. Other online apps will update within 30 minutes.', 'success');
  } catch (err) {
    setOwnerSidebarAdsStatus(err.message || 'Global sidebar ads could not be saved.', 'error');
  } finally {
    updateOwnerSidebarAdsSaveState(true);
  }
}

async function resetOwnerSidebarAds() {
  if (!sidebarAdState.ownerModalCanSave) {
    setOwnerSidebarAdsStatus('Global reset is unavailable right now.', 'error');
    return;
  }

  const tokenInput = document.getElementById('ownerSidebarAdsToken');
  const token = tokenInput ? tokenInput.value.trim() : '';
  if (!token) {
    setOwnerSidebarAdsStatus('Enter the admin token before resetting global ads.', 'error');
    return;
  }

  const ads = getBundledSidebarAds();
  const list = document.getElementById('ownerSidebarAdsList');
  if (list) list.innerHTML = ads.map(ownerAdRowTemplate).join('');
  updateOwnerSidebarAdsSaveState(false);
  setOwnerSidebarAdsStatus('Resetting global sidebar ads...', 'info');

  try {
    const data = await putOwnerSidebarAds(ads, token);
    sidebarAdState.ownerAdminToken = token;
    const savedAds = cacheRemoteSidebarAds(data.ads || ads, data.version);
    renderSidebarAd(savedAds);
    refreshSidebarAdPreviews();
    setOwnerSidebarAdsStatus('Global sidebar ads reset to bundled defaults.', 'success');
  } catch (err) {
    setOwnerSidebarAdsStatus(err.message || 'Global sidebar ads could not be reset.', 'error');
  } finally {
    updateOwnerSidebarAdsSaveState(true);
  }
}

function unlockSidebarAdOwnerTools() {
  sidebarAdState.ownerUnlocked = true;
  if (typeof toast === 'function') toast('Owner sidebar ad editor unlocked for this session.', 'success');
  showSidebarAdOwnerModal();
}

let sidebarAdOwnerShortcutCount = 0;
let sidebarAdOwnerShortcutTimer = null;

function initSidebarAdOwnerTools() {
  if (sidebarAdState.ownerToolsInitialized) return;
  sidebarAdState.ownerToolsInitialized = true;
  localStorage.removeItem('owner_sidebar_ads_enabled');
  localStorage.removeItem('owner_sidebar_ads_v1');

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.altKey && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      unlockSidebarAdOwnerTools();
    }
  });

  const footer = document.querySelector('.app-footer__text');
  if (footer) {
    footer.addEventListener('click', () => {
      sidebarAdOwnerShortcutCount += 1;
      clearTimeout(sidebarAdOwnerShortcutTimer);
      sidebarAdOwnerShortcutTimer = setTimeout(() => { sidebarAdOwnerShortcutCount = 0; }, 2000);
      if (sidebarAdOwnerShortcutCount >= 7) {
        sidebarAdOwnerShortcutCount = 0;
        unlockSidebarAdOwnerTools();
      }
    });
  }
}

async function refreshSidebarAdPreviews() {
  if (!window.electronAPI || typeof window.electronAPI.fetchLinkPreview !== 'function') return;
  const ads = sidebarAdState.ads;
  if (!ads.length) return;

  let changed = false;
  const enrichedAds = [...ads];

  for (let index = 0; index < ads.length; index += 1) {
    const ad = ads[index];
    if (!isPreviewableUrl(ad.clickUrl)) continue;

    const cachedPreview = getCachedAdPreview(ad.clickUrl);
    if (cachedPreview) {
      enrichedAds[index] = applyAdPreview(ad, cachedPreview);
      changed = true;
      continue;
    }

    try {
      const result = await window.electronAPI.fetchLinkPreview(ad.clickUrl);
      if (result && result.success && result.preview) {
        cacheAdPreview(ad.clickUrl, result.preview);
        enrichedAds[index] = applyAdPreview(ad, result.preview);
        changed = true;
      }
    } catch (err) {
      // Preview metadata is best-effort; bundled ad copy remains the fallback.
    }
  }

  if (changed) {
    const activeIndex = sidebarAdState.activeIndex;
    sidebarAdState.ads = enrichedAds;
    sidebarAdState.activeIndex = activeIndex;
    renderSidebarAd(enrichedAds);
    showSidebarAdIndex(activeIndex);
  }
}

function initSidebarAd() {
  localStorage.removeItem('owner_sidebar_ads_enabled');
  localStorage.removeItem('owner_sidebar_ads_v1');
  renderSidebarAd(getSidebarAds());
  if (isSidebarAdLowSpecMode()) {
    setTimeout(() => refreshRemoteSidebarAds({ render: true }), 30000);
  } else {
    refreshSidebarAdPreviews();
    refreshRemoteSidebarAds({ render: true });
    startSidebarAdRemoteRefresh();
  }
  initSidebarAdOwnerTools();
}
