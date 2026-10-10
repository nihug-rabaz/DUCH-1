"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

function todayIso() {
  return todayIsoLocal();
}

export default function ReportClient() {
  const router = useRouter();
  const search = useSearchParams();
  const mode = search.get("mode") || "base";

  const [statuses, setStatuses] = useState<StatusOption[]>([]);
  const [mainCode, setMainCode] = useState("");
  const [secondaryCode, setSecondaryCode] = useState("0");
  const [note, setNote] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [start, setStart] = useState(todayIso);
  const [end, setEnd] = useState(() => addDaysIso(todayIso(), 6));
  const [writeMin, setWriteMin] = useState<string | null>(null);
  const [writeMax, setWriteMax] = useState<string | null>(null);
  const [workdaysOnly, setWorkdaysOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (!hasSession()) {
      router.replace("/login");
      return;
    }
    (async () => {
      const result = await apiPost<{ statuses?: unknown; error?: string; auth_expired?: boolean }>(
        "/api/statuses",
      );
      if (!result.ok) {
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
      if (!flat.length) setError("לא נמצאו סוגי דיווח");
    })();
    (async () => {
      const result = await apiPost<{ minDate?: string | null }>("/api/future/list", {
        months_ahead: 1,
      });
      if (!result.ok) return;
      const min = normalizeIsoDate(result.data.minDate) || todayIso();
      const max = writeMaxFromMin(min) || addDaysIso(todayIso(), 6);
      setWriteMin(min);
      setWriteMax(max);
      setStart((prev) => (prev < min ? min : prev > max ? max : prev));
      setEnd((prev) => (prev > max ? max : prev < min ? max : prev));
    })();
  }, [router]);

  const bulkDates = useMemo(() => {
    const list: string[] = [];
    let cur = start;
    while (cur <= end) {
      const day = new Date(`${cur}T12:00:00`).getDay();
      if (
        isWithinWriteWindow(cur, writeMin, writeMax) &&
        (!workdaysOnly || (day !== 5 && day !== 6))
      ) {
        list.push(cur);
      }
      cur = addDaysIso(cur, 1);
      if (list.length > 62) break;
    }
    return list;
  }, [start, end, workdaysOnly, writeMin, writeMax]);

  async function submit(dates: string[]) {
    setBusy(true);
    setError("");
    setResults([]);
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
    setResults(result.data.results || []);
  }

  const heading =
    mode === "other" ? "אני במקום אחר" : mode === "base" ? "אני בבסיס" : "דיווח נוכחות";

  return (
    <AppShell showBack>
      <main className="page report-page">
        <div className="title-container">
          <div className="icon">
            <Image
              src={mode === "other" ? "/img/locationBtn.png" : "/img/basis.png"}
              alt=""
              width={55}
              height={55}
              unoptimized
            />
          </div>
          <h1 className="main-title">{heading}</h1>
          <p className="sub-title">בחרו סטטוס ושלחו דיווח — כמו בדו״ח 1</p>
        </div>

        <div className="report-panel stack">
          <div className="field">
            <label htmlFor="status">סטטוס דיווח</label>
            <select
              id="status"
              className="form-control"
              value={`${mainCode}|${secondaryCode}`}
              onChange={(e) => {
                const [m, s] = e.target.value.split("|");
                setMainCode(m);
                setSecondaryCode(s || "0");
              }}
            >
              {statuses.length === 0 ? <option value="|">טוען סטטוסים…</option> : null}
              {statuses.map((s) => (
                <option key={`${s.main}-${s.secondary}-${s.label}`} value={`${s.main}|${s.secondary}`}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="note">הערה (אופציונלי)</label>
            <input
              id="note"
              className="form-control"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <button
            className="btn-general send"
            type="button"
            disabled={busy || !mainCode}
            onClick={() => submit([todayIso()])}
          >
            שלח דיווח להיום
          </button>
        </div>

        <details
          className="bulk-nest"
          open={bulkOpen}
          onToggle={(e) => setBulkOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>
            <span className="bulk-summary-title">דיווח מרוכז</span>
            <span className="bulk-summary-help">
              {writeMax ? `עד ${writeMax} (חלון של כשבוע)` : "טווח תאריכים בחלון הדיווח העתידי"}
            </span>
          </summary>

          <div className="report-panel stack nested">
            {writeMin && writeMax ? (
              <div className="notice info center">
                one.prat מאפשר שמירה רק מ־{writeMin} עד {writeMax}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="start">מתאריך</label>
              <input
                id="start"
                className="form-control"
                type="date"
                value={start}
                min={writeMin || todayIso()}
                max={writeMax || undefined}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="end">עד תאריך</label>
              <input
                id="end"
                className="form-control"
                type="date"
                value={end}
                min={start || writeMin || todayIso()}
                max={writeMax || undefined}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={`chip ${workdaysOnly ? "selected" : ""}`}
              onClick={() => setWorkdaysOnly((v) => !v)}
            >
              ימי עבודה בלבד (א׳–ה׳)
            </button>
            <div className="notice info center">{bulkDates.length} תאריכים יישלחו</div>
            <button
              className="btn-general send"
              type="button"
              disabled={busy || !bulkDates.length || !mainCode}
              onClick={() => submit(bulkDates)}
            >
              דווח על {bulkDates.length} ימים
            </button>
          </div>
        </details>

        {error ? <div className="notice error">{error}</div> : null}
        {results.length ? (
          <div className="list">
            {results.map((r) => (
              <div key={String(r.date)} className="list-item">
                <div className="meta">
                  <strong>{String(r.date)}</strong>
                  <span>{String(r.message || r.status)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
