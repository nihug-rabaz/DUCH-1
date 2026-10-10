"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { apiPost, hasSession } from "@/lib/session";
import { flattenStatuses, pickDefaultStatus, type StatusOption } from "@/lib/statuses";
import {
  addDaysIso,
  isWithinWriteWindow,
  normalizeIsoDate,
  todayIsoLocal,
  writeMaxFromMin,
} from "@/lib/write-window";

type FutureReport = {
  date: string;
  date_prat?: string;
  main?: string;
  secondary?: string;
  status_code?: string;
};

const DOW = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("he-IL", {
    month: "long",
    year: "numeric",
  });
}

function todayIso() {
  return todayIsoLocal();
}

/** Fri=5, Sat=6 in JS Date (local). */
function isWeekend(iso: string) {
  const day = new Date(`${iso}T12:00:00`).getDay();
  return day === 5 || day === 6;
}

function isPast(iso: string) {
  return iso < todayIso();
}

function datesInRange(
  from: string,
  to: string,
  workdaysOnly: boolean,
  writeMin: string | null,
  writeMax: string | null,
): string[] {
  if (!from || !to) return [];
  let start = from <= to ? from : to;
  let end = from <= to ? to : from;
  if (start < todayIso()) start = todayIso();
  if (writeMin && start < writeMin) start = writeMin;
  if (writeMax && end > writeMax) end = writeMax;
  const list: string[] = [];
  let cur = start;
  while (cur <= end) {
    if (
      !isPast(cur) &&
      isWithinWriteWindow(cur, writeMin, writeMax) &&
      (!workdaysOnly || !isWeekend(cur))
    ) {
      list.push(cur);
    }
    cur = addDaysIso(cur, 1);
    if (list.length > 120) break;
  }
  return list;
}

export default function CalendarPage() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [reports, setReports] = useState<FutureReport[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<StatusOption[]>([]);
  const [statusesState, setStatusesState] = useState<"loading" | "ready" | "error">("loading");
  const [mainCode, setMainCode] = useState("");
  const [secondaryCode, setSecondaryCode] = useState("0");
  const [note, setNote] = useState("");
  const [rangeFrom, setRangeFrom] = useState(todayIso);
  const [rangeTo, setRangeTo] = useState(() => addDaysIso(todayIso(), 6));
  const [rangeWorkdaysOnly, setRangeWorkdaysOnly] = useState(true);
  const [writeMin, setWriteMin] = useState<string | null>(null);
  const [writeMax, setWriteMax] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const reportDates = useMemo(() => new Set(reports.map((r) => r.date)), [reports]);

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  const selectableInMonth = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const list: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${monthPrefix}-${String(d).padStart(2, "0")}`;
      if (!isPast(iso) && isWithinWriteWindow(iso, writeMin, writeMax)) list.push(iso);
    }
    return list;
  }, [year, month, monthPrefix, writeMin, writeMax]);

  const rangePreview = useMemo(
    () => datesInRange(rangeFrom, rangeTo, rangeWorkdaysOnly, writeMin, writeMax),
    [rangeFrom, rangeTo, rangeWorkdaysOnly, writeMin, writeMax],
  );

  const selectedList = useMemo(() => [...selected].sort(), [selected]);
  const selectedWithReport = selectedList.filter((d) => reportDates.has(d));
  const selectedWithoutReport = selectedList.filter((d) => !reportDates.has(d));

  async function load() {
    setError("");
    const result = await apiPost<{
      reports?: FutureReport[];
      minDate?: string | null;
      maxDate?: string | null;
      error?: string;
      auth_expired?: boolean;
    }>("/api/future/list", { months_ahead: 4 });
    if (!result.ok) {
      setError(result.data.error || "שגיאה בטעינה");
      if (result.data.auth_expired) router.replace("/login");
      return;
    }
    setReports(result.data.reports || []);
    // maxDate from API overstates writeability (~1 month); use minDate + 6 only.
    const min = normalizeIsoDate(result.data.minDate) || todayIso();
    const max = writeMaxFromMin(min) || addDaysIso(todayIso(), 6);
    setWriteMin(min);
    setWriteMax(max);
    setRangeFrom((prev) => (prev < min ? min : prev > max ? max : prev));
    setRangeTo((prev) => (prev > max ? max : prev < min ? max : prev));
    setSelected((prev) => {
      const next = new Set<string>();
      for (const d of prev) {
        if (isWithinWriteWindow(d, min, max)) next.add(d);
      }
      return next;
    });
  }

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    void load();
    (async () => {
      setStatusesState("loading");
      const result = await apiPost<{ statuses?: unknown; error?: string; auth_expired?: boolean }>(
        "/api/statuses",
      );
      if (!result.ok) {
        setStatusesState("error");
        setError(result.data.error || "לא ניתן לטעון סטטוסים");
        if (result.data.auth_expired) router.replace("/login");
        return;
      }
      const flat = flattenStatuses(result.data);
      setStatuses(flat);
      const preferred = pickDefaultStatus(flat);
      if (preferred) {
        setMainCode(preferred.main);
        setSecondaryCode(preferred.secondary);
      }
      setStatusesState(flat.length ? "ready" : "error");
      if (!flat.length) setError("לא נמצאו סוגי דיווח");
    })();
  }, [router]);

  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const items: Array<{
      key: string;
      day?: number;
      iso?: string;
      past?: boolean;
      weekend?: boolean;
      blocked?: boolean;
    }> = [];
    for (let i = 0; i < startPad; i++) items.push({ key: `p-${i}` });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${monthPrefix}-${String(d).padStart(2, "0")}`;
      const past = isPast(iso);
      const inWindow = isWithinWriteWindow(iso, writeMin, writeMax);
      items.push({
        key: iso,
        day: d,
        iso,
        past,
        weekend: isWeekend(iso),
        blocked: !past && !inWindow,
      });
    }
    return items;
  }, [year, month, monthPrefix, writeMin, writeMax]);

  function toggle(iso: string) {
    if (isPast(iso) || !isWithinWriteWindow(iso, writeMin, writeMax)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  function selectDates(isos: string[]) {
    setSelected(new Set(isos));
  }

  function selectWholeMonth() {
    selectDates(selectableInMonth);
  }

  function selectWorkdays() {
    selectDates(selectableInMonth.filter((iso) => !isWeekend(iso)));
  }

  function selectEmptyWorkdays() {
    selectDates(selectableInMonth.filter((iso) => !isWeekend(iso) && !reportDates.has(iso)));
  }

  function applyDateRange() {
    const list = datesInRange(rangeFrom, rangeTo, rangeWorkdaysOnly, writeMin, writeMax);
    if (!list.length) {
      setError(
        writeMax
          ? `אין תאריכים תקינים בטווח (ניתן לדווח עד ${writeMax})`
          : "אין תאריכים תקינים בטווח (עתידיים בלבד)",
      );
      return;
    }
    setError("");
    selectDates(list);
    // Jump calendar to start of selection
    const first = list[0];
    setYear(Number(first.slice(0, 4)));
    setMonth(Number(first.slice(5, 7)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
    setSelected(new Set());
  }

  async function reportSelected() {
    if (!selectedWithoutReport.length || !mainCode || !writeMin || !writeMax) return;
    const dates = selectedWithoutReport.filter((d) =>
      isWithinWriteWindow(d, writeMin, writeMax),
    );
    if (!dates.length) {
      setError("אין תאריכים בחלון הדיווח העתידי");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    const result = await apiPost<{ results?: Array<Record<string, unknown>>; error?: string }>(
      "/api/report/bulk",
      {
        dates,
        main_code: mainCode,
        secondary_code: secondaryCode,
        note,
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.data.error || "הדיווח נכשל");
      return;
    }
    const rows = result.data.results || [];
    const okCount = rows.filter((r) => r.ok === true || r.status === "success").length;
    const outOfWindow = rows.filter((r) =>
      String(r.message || "").includes("מחוץ לחלון"),
    ).length;
    const duplicates = rows.filter((r) => r.status === "skipped_duplicate").length;
    const otherFail = rows.length - okCount - outOfWindow - duplicates;
    const parts = [`נשמרו ${okCount} מתוך ${rows.length}`];
    if (outOfWindow) parts.push(`${outOfWindow} מחוץ לחלון של כשבוע`);
    if (duplicates) parts.push(`${duplicates} כבר היו מדווחים`);
    if (otherFail > 0) parts.push(`${otherFail} נכשלו`);
    setMessage(parts.join(" · "));
    setSelected(new Set());
    await load();
  }

  async function cancelSelected() {
    if (!selectedWithReport.length) return;
    setBusy(true);
    setMessage("");
    setError("");
    const result = await apiPost<{ results?: Array<{ ok?: boolean }>; error?: string }>(
      "/api/report/delete-bulk",
      { dates: selectedWithReport },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.data.error || "ביטול נכשל");
      return;
    }
    setMessage(`בוטלו ${selectedWithReport.length} דיווחים`);
    setSelected(new Set());
    await load();
  }

  const monthReports = reports.filter((r) => r.date.startsWith(monthPrefix));

  const statusPlaceholder =
    statusesState === "loading"
      ? "טוען סטטוסים…"
      : statusesState === "error"
        ? "לא נטענו סטטוסים"
        : "בחרו סטטוס";

  return (
    <AppShell showBack>
      <main className="page calendar-page">
        <div className="title-container">
          <div className="icon">
            <Image src="/img/futureReport.png" alt="" width={40} height={40} unoptimized />
          </div>
          <h1 className="main-title">דיווחים עתידיים</h1>
          <p className="sub-title">בחרו תאריכים לדיווח מרוכז, או בטלו דיווחים קיימים</p>
        </div>

        {writeMin && writeMax ? (
          <div className="notice info center">
            one.prat שומר דיווח עתידי רק בחלון של כשבוע: {writeMin} עד {writeMax}
          </div>
        ) : null}

        <div className="card-panel stack">
          <div className="month-nav">
            <button type="button" className="chip nav-chip" onClick={() => shiftMonth(-1)} aria-label="חודש קודם">
              ‹
            </button>
            <strong className="month-label">{monthLabel(year, month)}</strong>
            <button type="button" className="chip nav-chip" onClick={() => shiftMonth(1)} aria-label="חודש הבא">
              ›
            </button>
          </div>

          <div className="range-select stack">
            <div className="range-fields">
              <div className="field">
                <label htmlFor="range-from">מתאריך</label>
                <input
                  id="range-from"
                  className="form-control"
                  type="date"
                  value={rangeFrom}
                  min={writeMin || todayIso()}
                  max={writeMax || undefined}
                  onChange={(e) => setRangeFrom(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="range-to">עד תאריך</label>
                <input
                  id="range-to"
                  className="form-control"
                  type="date"
                  value={rangeTo}
                  min={rangeFrom || writeMin || todayIso()}
                  max={writeMax || undefined}
                  onChange={(e) => setRangeTo(e.target.value)}
                />
              </div>
            </div>
            <div className="chip-row quick-select">
              <button
                type="button"
                className={`chip ${rangeWorkdaysOnly ? "selected" : ""}`}
                onClick={() => setRangeWorkdaysOnly((v) => !v)}
              >
                ימי עבודה בלבד
              </button>
              <button
                type="button"
                className="chip"
                disabled={!rangePreview.length}
                onClick={applyDateRange}
              >
                בחר טווח ({rangePreview.length})
              </button>
            </div>
          </div>

          <div className="quick-select chip-row">
            <button type="button" className="chip" onClick={selectWholeMonth}>
              כל החודש
            </button>
            <button type="button" className="chip" onClick={selectWorkdays}>
              בלי סופ״ש
            </button>
            <button type="button" className="chip" onClick={selectEmptyWorkdays}>
              ימי עבודה פנויים
            </button>
            <button type="button" className="chip ghost" onClick={clearSelection} disabled={!selected.size}>
              נקה בחירה
            </button>
          </div>

          <div className="calendar-grid">
            {DOW.map((d) => (
              <div key={d} className="dow">
                {d}
              </div>
            ))}
            {cells.map((cell) =>
              cell.iso ? (
                <button
                  key={cell.key}
                  type="button"
                  disabled={cell.past || cell.blocked}
                  title={cell.blocked ? "מחוץ לחלון הדיווח העתידי" : undefined}
                  className={[
                    "day-btn",
                    selected.has(cell.iso) ? "selected" : "",
                    reportDates.has(cell.iso) ? "has-report" : "",
                    cell.weekend ? "weekend" : "",
                    cell.past ? "past" : "",
                    cell.blocked ? "blocked" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => toggle(cell.iso!)}
                >
                  <span className="day-num">{cell.day}</span>
                  {reportDates.has(cell.iso) ? <span className="day-dot" aria-hidden /> : null}
                </button>
              ) : (
                <div key={cell.key} className="day-btn muted" />
              ),
            )}
          </div>

          <div className="legend">
            <span>
              <i className="legend-dot selected" /> נבחר
            </span>
            <span>
              <i className="legend-dot report" /> יש דיווח
            </span>
            <span>
              <i className="legend-dot weekend" /> סופ״ש
            </span>
            <span>
              <i className="legend-dot blocked" /> מחוץ לחלון
            </span>
          </div>
        </div>

        {selected.size > 0 ? (
          <div className="card-panel stack action-panel">
            <div className="selection-summary">
              נבחרו <strong>{selected.size}</strong> תאריכים
              {selectedWithoutReport.length ? (
                <>
                  {" "}
                  · <strong>{selectedWithoutReport.length}</strong> לדיווח
                </>
              ) : null}
              {selectedWithReport.length ? (
                <>
                  {" "}
                  · <strong>{selectedWithReport.length}</strong> לביטול
                </>
              ) : null}
            </div>

            {selectedWithoutReport.length > 0 ? (
              <>
                <div className="field">
                  <label htmlFor="cal-status">סטטוס לדיווח</label>
                  <select
                    id="cal-status"
                    className="form-control"
                    value={`${mainCode}|${secondaryCode}`}
                    disabled={statuses.length === 0}
                    onChange={(e) => {
                      const [m, s] = e.target.value.split("|");
                      setMainCode(m);
                      setSecondaryCode(s || "0");
                    }}
                  >
                    {statuses.length === 0 ? <option value="|">{statusPlaceholder}</option> : null}
                    {statuses.map((s) => (
                      <option
                        key={`${s.main}-${s.secondary}-${s.label}`}
                        value={`${s.main}|${s.secondary}`}
                      >
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="cal-note">הערה (אופציונלי)</label>
                  <input
                    id="cal-note"
                    className="form-control"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <button
                  className="btn-general send"
                  type="button"
                  disabled={busy || !mainCode}
                  onClick={reportSelected}
                >
                  דווח על {selectedWithoutReport.length} ימים נבחרים
                </button>
              </>
            ) : null}

            {selectedWithReport.length > 0 ? (
              <button
                className="btn-general welcome danger-outline"
                type="button"
                disabled={busy}
                onClick={cancelSelected}
              >
                בטל {selectedWithReport.length} דיווחים קיימים
              </button>
            ) : null}
          </div>
        ) : (
          <div className="notice info center">
            בחרו מתאריך–עד תאריך, או ימים בלוח — ואז דווחו או בטלו
          </div>
        )}

        <div className="list">
          <h2 className="section-label">דיווחים בחודש זה</h2>
          {monthReports.length === 0 ? (
            <div className="notice info center">אין דיווחים עתידיים בחודש זה עדיין</div>
          ) : (
            monthReports.map((r) => (
              <div key={r.date} className="list-item">
                <div className="meta">
                  <strong>{r.date_prat || r.date}</strong>
                  <span>
                    {r.main || "דיווח"}
                    {r.secondary ? ` · ${r.secondary}` : ""}
                  </span>
                </div>
                <button type="button" className="chip" onClick={() => toggle(r.date)}>
                  {selected.has(r.date) ? "נבחר ✓" : "בחר"}
                </button>
              </div>
            ))
          )}
        </div>

        {error ? <div className="notice error">{error}</div> : null}
        {message ? <div className="notice success">{message}</div> : null}
      </main>
    </AppShell>
  );
}
