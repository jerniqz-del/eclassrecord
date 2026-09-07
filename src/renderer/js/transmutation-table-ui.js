(function () {
  'use strict';

  let escapeHandler = null;

  function formatIg(value) {
    return typeof formatTransmutationInitialGrade === 'function'
      ? formatTransmutationInitialGrade(value)
      : (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—');
  }

  function formatTg(value) {
    return typeof formatTransmutationGrade === 'function'
      ? formatTransmutationGrade(value)
      : String(value == null ? '—' : value);
  }

  function formatRange(low, high) {
    return `${formatIg(low)} – ${formatIg(high)}`;
  }

  function setModalOpen(overlay, open) {
    if (!overlay) return;
    overlay.hidden = !open;
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
    overlay.classList.toggle('is-open', open);
  }

  function ensureModal() {
    let overlay = document.getElementById('transmutationTableModal');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'transmutationTableModal';
    overlay.className = 'modal-overlay transmutation-table-modal';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="modal modal--wide transmutation-table-dialog" role="dialog" aria-modal="true" aria-labelledby="transmutationTableTitle">
        <div class="transmutation-table-header">
          <div>
            <div id="transmutationTableTitle" class="modal__title">Transmutation Table</div>
            <div id="transmutationTableSource" class="transmutation-table-source"></div>
          </div>
          <button type="button" class="transmutation-table-close" data-modal-cancel aria-label="Close transmutation table">&times;</button>
        </div>
        <div id="transmutationTableSummary" class="transmutation-table-summary"></div>
        <div id="transmutationTableNote" class="transmutation-table-note" hidden></div>
        <div id="transmutationTableScroll" class="transmutation-table-scroll">
          <table class="transmutation-table">
            <thead>
              <tr>
                <th>Initial Grade</th>
                <th>Transmuted Grade</th>
                <th class="transmutation-table-descriptor-col">Descriptor</th>
              </tr>
            </thead>
            <tbody id="transmutationTableBody"></tbody>
          </table>
        </div>
        <div class="modal__actions">
          <button type="button" class="btn btn-primary btn-sm transmutation-table-done">Done</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.transmutation-table-close').addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      closeTransmutationTable();
    });
    overlay.querySelector('.transmutation-table-done').addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      closeTransmutationTable();
    });
    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        event.preventDefault();
        event.stopPropagation();
        closeTransmutationTable();
      }
    });
    return overlay;
  }

  function bindEscape(active) {
    if (escapeHandler) {
      document.removeEventListener('keydown', escapeHandler);
      escapeHandler = null;
    }
    if (!active) return;
    escapeHandler = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTransmutationTable();
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  function closeTransmutationTable() {
    const overlay = document.getElementById('transmutationTableModal');
    setModalOpen(overlay, false);
    bindEscape(false);
  }

  function openTransmutationTable(details) {
    const assignment = details && details.assignment
      ? details.assignment
      : (typeof currentAssignment === 'function' ? currentAssignment() : null);
    const ig = Number(details && details.initialGrade);
    if (!Number.isFinite(ig) || typeof transmutationTableModel !== 'function') {
      if (typeof toast === 'function') toast('Transmutation table is unavailable for this grade.', 'error');
      return;
    }
    const model = transmutationTableModel(assignment || {}, ig);
    const overlay = ensureModal();
    const displayedTg = details && details.transmutedGrade != null && details.transmutedGrade !== ''
      ? details.transmutedGrade
      : model.transmutedGrade;
    const tgLabel = formatTg(displayedTg);

    overlay.querySelector('#transmutationTableTitle').textContent = model.title;
    overlay.querySelector('#transmutationTableSource').textContent = model.sourceLabel || '';
    overlay.querySelector('#transmutationTableSummary').innerHTML = `
      <div>
        <span>Initial Grade</span>
        <strong class="transmutation-ig-chip">${esc(formatIg(model.initialGrade))}</strong>
      </div>
      <div class="transmutation-table-arrow" aria-hidden="true">→</div>
      <div>
        <span>Transmuted Grade</span>
        <strong class="transmutation-tg-chip">${esc(String(tgLabel))}</strong>
      </div>`;

    const note = overlay.querySelector('#transmutationTableNote');
    const scroll = overlay.querySelector('#transmutationTableScroll');
    const body = overlay.querySelector('#transmutationTableBody');
    const descriptorCol = overlay.querySelector('.transmutation-table-descriptor-col');

    if (model.kind === 'zero') {
      note.hidden = false;
      note.textContent = 'There is no range table for zero-based grading. The transmuted grade is the initial grade rounded to a whole number.';
      scroll.hidden = true;
      body.innerHTML = '';
    } else {
      note.hidden = true;
      note.textContent = '';
      scroll.hidden = false;
      const showDescriptor = model.rows.some(row => row.descriptor);
      if (descriptorCol) descriptorCol.hidden = !showDescriptor;
      body.innerHTML = model.rows.map((row, index) => {
        const isMatch = index === model.matchIndex;
        const descriptorCell = showDescriptor
          ? `<td class="transmutation-descriptor">${esc(row.descriptor || '')}</td>`
          : '';
        return `<tr class="${isMatch ? 'is-match' : ''}" data-match-row="${isMatch ? 'true' : 'false'}">
          <td class="transmutation-ig-cell${isMatch ? ' is-ig-match' : ''}">${esc(formatRange(row.low, row.high))}</td>
          <td class="transmutation-tg-cell${isMatch ? ' is-tg-match' : ''}">${esc(formatTg(row.tg))}</td>
          ${descriptorCell}
        </tr>`;
      }).join('');
    }

    setModalOpen(overlay, true);
    bindEscape(true);
    const matchRow = body.querySelector('tr.is-match');
    if (matchRow && typeof matchRow.scrollIntoView === 'function') {
      matchRow.scrollIntoView({ block: 'center' });
    }
    const done = overlay.querySelector('.transmutation-table-done');
    if (done && typeof done.focus === 'function') done.focus();
  }

  function triggerFromEvent(event) {
    const trigger = event.target && event.target.closest ? event.target.closest('.tg-lookup-trigger') : null;
    if (!trigger || trigger.closest('#transmutationTableModal')) return null;
    return trigger;
  }

  function openFromTrigger(trigger) {
    openTransmutationTable({
      initialGrade: trigger.dataset.initialGrade,
      transmutedGrade: trigger.dataset.transmutedGrade,
      assignment: typeof currentAssignment === 'function' ? currentAssignment() : null
    });
  }

  document.addEventListener('click', event => {
    const trigger = triggerFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    openFromTrigger(trigger);
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const trigger = triggerFromEvent(event);
    if (!trigger) return;
    event.preventDefault();
    openFromTrigger(trigger);
  });

  globalThis.openTransmutationTable = openTransmutationTable;
  globalThis.closeTransmutationTable = closeTransmutationTable;
})();
