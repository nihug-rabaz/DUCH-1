(function () {
  const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const DAY_NAMES = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

  let viewYear;
  let viewMonth; // 0-11
  let selected = new Set();
  let reportedDates = new Set();
  let mode = 'toggle'; // toggle | range | workdays
  let rangeStart = null;
  let statuses = { primaries: [] };

  function iso(y, m, d) {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    return y + '-' + mm + '-' + dd;
  }

  function parseIso(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function isWeekend(date) {
    const day = date.getDay(); // 0 Sun .. 6 Sat
    return day === 5 || day === 6;
  }

  function updateSummary() {
    const list = Array.from(selected).sort();
    document.getElementById('selected-count').textContent = String(list.length);
    document.getElementById('selected-range').textContent = list.length
      ? (list[0] + (list.length > 1 ? ' → ' + list[list.length - 1] : '') + (list.length > 2 ? ' (' + list.length + ' ימים)' : ''))
      : 'לא נבחרו תאריכים';
    const stickyCount = document.getElementById('sticky-count');
    if (stickyCount) stickyCount.textContent = String(list.length);
    const btn = document.getElementById('btn-submit-bulk');
    if (btn) btn.disabled = list.length === 0;
  }

  function selectWorkdaysInView() {
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      if (isWeekend(date)) continue;
      const key = iso(viewYear, viewMonth, d);
      if (reportedDates.has(key)) continue;
      selected.add(key);
    }
    renderCalendar();
  }

  function applyRange(a, b) {
    const start = a < b ? a : b;
    const end = a < b ? b : a;
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cur <= last) {
      if (!isWeekend(cur)) {
        const key = iso(cur.getFullYear(), cur.getMonth(), cur.getDate());
        if (!reportedDates.has(key)) selected.add(key);
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  function onDayClick(key, date) {
    if (isWeekend(date)) return;
    if (mode === 'range') {
      if (!rangeStart) {
        rangeStart = date;
        selected.add(key);
      } else {
        applyRange(rangeStart, date);
        rangeStart = null;
      }
    } else {
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
    }
    renderCalendar();
  }

  function renderCalendar() {
    document.getElementById('cal-title').textContent = MONTHS[viewMonth] + ' ' + viewYear;
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';
    DAY_NAMES.forEach(function (name) {
      const h = document.createElement('div');
      h.className = 'cal-head';
      h.textContent = name;
      grid.appendChild(h);
    });

    const first = new Date(viewYear, viewMonth, 1);
    const offset = first.getDay();
    for (let i = 0; i < offset; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-day empty';
      grid.appendChild(empty);
    }

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      const key = iso(viewYear, viewMonth, d);
      const el = document.createElement('div');
      el.className = 'cal-day';
      let hint = '';
      if (isWeekend(date)) {
        el.classList.add('weekend');
        hint = 'סופ״ש';
      } else if (reportedDates.has(key)) {
        el.classList.add('reported');
        hint = 'מתוזמן';
      }
      if (selected.has(key)) {
        el.classList.add('selected');
        hint = 'נבחר';
      }
      el.innerHTML = '<div class="num">' + d + '</div><div class="hint">' + hint + '</div>';
      if (!isWeekend(date)) {
        el.onclick = function () { onDayClick(key, date); };
      }
      grid.appendChild(el);
    }
    updateSummary();
  }

  function fillSecondaries() {
    const mainCode = document.getElementById('main-code').value;
    const secondary = document.getElementById('secondary-code');
    secondary.innerHTML = '';
    const primary = (statuses.primaries || []).find(function (p) {
      return String(p.statusCode) === String(mainCode);
    });
    const list = (primary && primary.secondaries) || [];
    list.forEach(function (s) {
      const opt = document.createElement('option');
      opt.value = s.statusCode;
      opt.textContent = s.statusDescription || s.statusCode;
      secondary.appendChild(opt);
    });
  }

  function fillPrimaries() {
    const select = document.getElementById('main-code');
    select.innerHTML = '';
    (statuses.primaries || []).forEach(function (p) {
      if (p.isEmergency) return;
      const opt = document.createElement('option');
      opt.value = p.statusCode;
      opt.textContent = (p.statusDescription || '').trim() || p.statusCode;
      select.appendChild(opt);
    });
    // Prefer in-base / present default if exists
    const preferred = (statuses.primaries || []).find(function (p) {
      return String(p.statusCode) === '01';
    });
    if (preferred) select.value = '01';
    fillSecondaries();
  }

  async function loadStatuses() {
    const result = await DuchSession.apiPost('/api/statuses', {});
    if (!result.ok) {
      throw new Error((result.data && result.data.error) || 'כשל בטעינת סוגי דיווח');
    }
    statuses = result.data;
    if (!statuses.primaries && Array.isArray(statuses)) {
      statuses = { primaries: statuses };
    }
    fillPrimaries();
  }

  async function loadFutureReported() {
    const result = await DuchSession.apiPost('/api/future/list', { months_ahead: 3 });
    if (!result.ok) return;
    reportedDates = new Set();
    (result.data.reports || []).forEach(function (item) {
      if (item.date) reportedDates.add(String(item.date).slice(0, 10));
    });
  }

  async function submitBulk() {
    const dates = Array.from(selected).sort();
    const main = document.getElementById('main-code').value;
    const secondary = document.getElementById('secondary-code').value;
    const note = document.getElementById('note').value || '';
    const skip = document.getElementById('skip-duplicates').checked;
    const resultsBox = document.getElementById('results');
    const err = document.getElementById('report-error');
    err.style.display = 'none';
    resultsBox.innerHTML = '<div class="muted">שולח דיווחים...</div>';

    const btn = document.getElementById('btn-submit-bulk');
    btn.disabled = true;
    try {
      const result = await DuchSession.apiPost('/api/report/bulk', {
        dates: dates,
        main_code: main,
        secondary_code: secondary,
        note: note,
        skip_duplicates: skip
      });
      if (result.data.auth_expired) {
        DuchSession.updateSessionBadge();
      }
      if (!result.ok && !(result.data && result.data.results)) {
        err.textContent = (result.data && result.data.error) || 'שגיאה בשליחה';
        err.style.display = 'block';
        resultsBox.innerHTML = '';
        return;
      }
      const rows = result.data.results || [];
      resultsBox.innerHTML = '';
      rows.forEach(function (row) {
        const div = document.createElement('div');
        div.className = 'result-row ' + (row.status || 'rejected');
        div.textContent = row.date + ' · ' + row.status + ' · ' + (row.message || '');
        resultsBox.appendChild(div);
        if (row.status === 'success') reportedDates.add(row.date);
      });
      const summary = document.createElement('div');
      summary.className = 'notice notice-info';
      summary.textContent =
        'הצלחות: ' + (result.data.success_count || 0) +
        ' · נדחו: ' + (result.data.rejected_count || 0) +
        ' · דולגו: ' + (result.data.skipped_count || 0);
      resultsBox.prepend(summary);
      renderCalendar();
    } catch (e) {
      err.textContent = e.message || 'שגיאה';
      err.style.display = 'block';
      resultsBox.innerHTML = '';
    } finally {
      btn.disabled = selected.size === 0;
    }
  }

  function bindUi() {
    document.getElementById('cal-prev').onclick = function () {
      viewMonth -= 1;
      if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
      renderCalendar();
    };
    document.getElementById('cal-next').onclick = function () {
      viewMonth += 1;
      if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
      renderCalendar();
    };
    document.getElementById('btn-mode-toggle').onclick = function () {
      mode = 'toggle';
      rangeStart = null;
      setModeButtons();
    };
    document.getElementById('btn-mode-range').onclick = function () {
      mode = 'range';
      rangeStart = null;
      setModeButtons();
    };
    document.getElementById('btn-mode-workdays').onclick = function () {
      mode = 'workdays';
      selectWorkdaysInView();
      setModeButtons();
    };
    document.getElementById('btn-clear').onclick = function () {
      selected.clear();
      rangeStart = null;
      renderCalendar();
    };
    document.getElementById('main-code').onchange = fillSecondaries;
    document.getElementById('btn-continue').onclick = function () {
      document.getElementById('codes-card').scrollIntoView({ behavior: 'smooth' });
    };
    document.getElementById('btn-submit-bulk').onclick = submitBulk;
  }

  function setModeButtons() {
    ['toggle', 'range', 'workdays'].forEach(function (m) {
      const btn = document.getElementById('btn-mode-' + m);
      if (!btn) return;
      btn.className = 'btn ' + (mode === m ? 'btn-primary' : 'btn-secondary');
    });
  }

  async function init() {
    if (!DuchSession.requireSession('/login')) return;
    DuchSession.updateSessionBadge();
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    bindUi();
    setModeButtons();
    try {
      await loadStatuses();
      await loadFutureReported();
      renderCalendar();
    } catch (e) {
      const err = document.getElementById('report-error');
      err.textContent = e.message || 'שגיאה בטעינה';
      err.style.display = 'block';
      if (String(e.message || '').indexOf('פג') >= 0) {
        DuchSession.markInvalid();
        DuchSession.updateSessionBadge();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
