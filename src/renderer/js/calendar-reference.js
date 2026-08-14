(function initCalendarReferenceDesign(globalScope) {
  'use strict';

  const icon = path => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
  const calendarIcon = icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"/>');
  const chevronIcon = icon('<path d="m9 18 6-6-6-6"/>');

  function installStructure() {
    const page = document.querySelector('.calendar-page-view');
    const layout = page?.querySelector('.calendar-layout');
    const card = layout?.querySelector('.calendar-card');
    const sidebar = layout?.querySelector('.calendar-sidebar-card');
    if (!page || !layout || !card || !sidebar || page.dataset.referenceDesign === 'true') return;
    page.dataset.referenceDesign = 'true';

    const navigationButtons = card.querySelectorAll('.calendar-month-navigation button');
    if (navigationButtons[0]) navigationButtons[0].innerHTML = icon('<path d="m15 18-6-6 6-6"/>');
    if (navigationButtons[1]) navigationButtons[1].innerHTML = chevronIcon;
    navigationButtons.forEach(button => button.className = 'calendar-nav-button');

    const legend = document.createElement('footer');
    legend.className = 'calendar-legend no-print';
    legend.setAttribute('aria-label', 'Calendar legend');
    legend.innerHTML = `
      <span><i class="calendar-legend__swatch calendar-legend__swatch--holiday"></i>Official holiday</span>
      <span><i class="calendar-legend__swatch calendar-legend__swatch--activity"></i>School activity</span>
      <span><i class="calendar-legend__swatch calendar-legend__swatch--assessment"></i>Assessment</span>
      <span><i class="calendar-legend__swatch calendar-legend__swatch--birthday"></i>Birthday</span>
      <span class="calendar-legend__hint">${icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>')}Click a date to add an event</span>`;
    card.appendChild(legend);

    const stack = document.createElement('div');
    stack.className = 'calendar-sidebar-stack';
    layout.insertBefore(stack, sidebar);
    stack.appendChild(sidebar);

    const heading = sidebar.querySelector('.calendar-sidebar-heading');
    if (heading) heading.innerHTML = `${calendarIcon}<span>Upcoming Events</span>`;
    const viewAll = document.createElement('button');
    viewAll.id = 'calendarViewAllEvents';
    viewAll.className = 'calendar-view-all';
    viewAll.type = 'button';
    viewAll.innerHTML = `<span>View All Events</span>${chevronIcon}`;
    viewAll.addEventListener('click', toggleAgenda);
    sidebar.appendChild(viewAll);

    const summary = document.createElement('section');
    summary.className = 'calendar-summary-card';
    summary.setAttribute('aria-labelledby', 'calendarSummaryTitle');
    summary.innerHTML = `
      <h2 id="calendarSummaryTitle">${calendarIcon}<span>Calendar Summary</span></h2>
      <div class="calendar-summary-list">
        <div><span><i class="calendar-summary-icon calendar-summary-icon--holiday">▣</i>Official Holidays</span><strong id="calendarSummaryHolidays">0</strong></div>
        <div><span><i class="calendar-summary-icon calendar-summary-icon--assessment">▤</i>Assessments</span><strong id="calendarSummaryAssessments">0</strong></div>
        <div><span><i class="calendar-summary-icon calendar-summary-icon--activity">▧</i>School Activities</span><strong id="calendarSummaryActivities">0</strong></div>
        <div><span><i class="calendar-summary-icon calendar-summary-icon--birthday">♙</i>Birthdays This Month</span><strong id="calendarSummaryBirthdays">0</strong></div>
      </div>`;
    stack.appendChild(summary);

    const tip = document.createElement('section');
    tip.className = 'calendar-tip-card no-print';
    tip.innerHTML = `<div class="calendar-tip-card__icon" aria-hidden="true">🗓️</div><div><strong>Tip: Keep your calendar updated</strong><p>Sync regularly to stay aligned with the DepEd calendar.</p><button type="button">↻&nbsp;&nbsp; Sync Now</button></div>`;
    tip.querySelector('button')?.addEventListener('click', syncNow);
    stack.appendChild(tip);

    const addButton = document.createElement('button');
    addButton.className = 'calendar-floating-add no-print';
    addButton.type = 'button';
    addButton.setAttribute('aria-label', 'Add a calendar event');
    addButton.title = 'Add event';
    addButton.textContent = '+';
    addButton.addEventListener('click', openToday);
    page.appendChild(addButton);
  }

  function enhanceAgenda() {
    document.querySelectorAll('#calendarSidebarList .calendar-agenda-item').forEach(item => {
      if (item.dataset.referenceEnhanced === 'true') return;
      item.dataset.referenceEnhanced = 'true';
      const dateNode = item.querySelector('.calendar-agenda-item__date');
      const parsed = new Date(dateNode?.textContent?.trim() || '');
      if (dateNode && !Number.isNaN(parsed.getTime())) {
        dateNode.innerHTML = `<span>${parsed.toLocaleString('en-US', { month: 'short' }).toUpperCase()}</span><strong>${parsed.getDate()}</strong>`;
      }
      const title = item.querySelector('.calendar-agenda-item__title');
      if (!title || item.querySelector('.calendar-agenda-item__type')) return;
      const type = item.classList.contains('calendar-agenda-item--holiday') ? 'Official Holiday'
        : item.classList.contains('calendar-agenda-item--exam') || item.classList.contains('calendar-agenda-item--ww') || item.classList.contains('calendar-agenda-item--pt') ? 'Assessment'
          : item.classList.contains('calendar-agenda-item--milestone') ? 'School Activity' : 'Reminder';
      const badge = document.createElement('span');
      badge.className = 'calendar-agenda-item__type';
      badge.textContent = type;
      title.insertAdjacentElement('afterend', badge);
    });
  }

  function visibleCount(selector) {
    return [...document.querySelectorAll(`#calendarGrid ${selector}`)].filter(node => !node.hidden).length;
  }

  function updateSummary() {
    const values = {
      calendarSummaryHolidays: visibleCount('.event-pill--holiday'),
      calendarSummaryAssessments: visibleCount('.event-pill--exam, .event-pill--ww, .event-pill--pt'),
      calendarSummaryActivities: visibleCount('.event-pill--milestone, .event-pill--reminder'),
      calendarSummaryBirthdays: visibleCount('.calendar-event-pill--birthday')
    };
    Object.entries(values).forEach(([id, value]) => {
      const target = document.getElementById(id);
      if (target) target.textContent = String(value);
    });
  }

  function refresh() {
    installStructure();
    enhanceAgenda();
    updateSummary();
  }

  function toggleAgenda() {
    const sidebar = document.querySelector('.calendar-sidebar-card');
    const button = document.getElementById('calendarViewAllEvents');
    const expanded = sidebar?.classList.toggle('is-expanded');
    const label = button?.querySelector('span');
    if (label) label.textContent = expanded ? 'Show Less' : 'View All Events';
    button?.setAttribute('aria-expanded', String(Boolean(expanded)));
  }

  function openToday() {
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    globalScope.openCalendarDate?.(date);
  }

  function syncNow() {
    if (typeof globalScope.syncCalendarFromRemote === 'function' && !document.getElementById('btnCalendarSync')?.hidden) {
      globalScope.syncCalendarFromRemote();
      return;
    }
    globalScope.toast?.('Your local calendar is ready and up to date.', 'success');
  }

  const baseRender = globalScope.renderCalendar;
  globalScope.renderCalendar = function renderCalendarReference() {
    baseRender?.();
    refresh();
  };
  globalScope.refreshCalendarReferenceDesign = refresh;
  globalScope.toggleCalendarAgenda = toggleAgenda;
  globalScope.openCalendarToday = openToday;
  globalScope.syncCalendarRedesign = syncNow;
  installStructure();
})(window);
