import { pratFetch } from "@/lib/prat-fetch";

const BASE = "https://one.prat.idf.il";

function headers(cookie: string, referer = "https://one.prat.idf.il/hp", json = true) {
  const h: Record<string, string> = {
    accept: "application/json, text/plain, */*",
    "accept-language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    "access-control-allow-origin": "*",
    "cache-control": "no-cache",
    crossdomain: "true",
    origin: "https://one.prat.idf.il",
    pragma: "no-cache",
    referer,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
    Cookie: cookie,
  };
  if (json) h["content-type"] = "application/json;charset=UTF-8";
  return h;
}

function normalizeDayDate(raw: unknown): string {
  if (!raw) return "";
  let text = String(raw).trim();
  try {
    if (text.includes("T")) text = text.split("T")[0];
    if (text.includes(".") && text.split(".").length === 3) {
      const [d, m, y] = text.slice(0, 10).split(".");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return text.slice(0, 10);
  } catch {
    return "";
  }
}

function dayHasReport(day: Record<string, unknown>) {
  const code = day.reportedStatusCode || day.statusCode || "";
  const main = day.reportedMainName || day.mainStatusReported || "";
  const secondary = day.secondaryStatusReported || day.reportedSecondaryName || "";
  return Boolean(String(code).trim() || String(main).trim() || String(secondary).trim());
}

function isoToPrat(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export async function validateSession(cookie: string) {
  const statusRes = await pratFetch(`${BASE}/api/Attendance/GetAllFilterStatuses`, {
    headers: headers(cookie, "https://one.prat.idf.il/hp", false),
  });
  if (statusRes.status === 401 || statusRes.status === 403) {
    return { ok: false as const, auth_expired: true, error: "הסשן פג תוקף" };
  }
  if (!statusRes.ok) {
    return {
      ok: false as const,
      error: `אימות נכשל (${statusRes.status})`,
      auth_expired: false,
    };
  }
  let userName = "";
  try {
    const userRes = await pratFetch(`${BASE}/api/account/getUser`, {
      headers: headers(cookie, "https://one.prat.idf.il/hp", false),
    });
    if (userRes.ok) {
      const user = (await userRes.json()) as Record<string, string>;
      userName = user.fullName || user.name || user.displayName || "";
    }
  } catch {
    /* ignore */
  }
  const statuses = await statusRes.json().catch(() => ({}));
  return { ok: true as const, user_name: userName, statuses };
}

export async function getFilterStatuses(cookie: string) {
  const response = await pratFetch(`${BASE}/api/Attendance/GetAllFilterStatuses`, {
    headers: headers(cookie, "https://one.prat.idf.il/hp", false),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, data: body };
}

export async function getReportedData(cookie: string) {
  const response = await pratFetch(`${BASE}/api/Attendance/GetReportedData`, {
    headers: headers(cookie, "https://one.prat.idf.il/hp", false),
  });
  if (response.status === 401 || response.status === 403) {
    return { auth_expired: true };
  }
  if (!response.ok) return {};
  return response.json();
}

export async function getFutureReportsMonth(cookie: string, month: number, year: number) {
  const response = await pratFetch(`${BASE}/api/Attendance/getFutureReport`, {
    method: "POST",
    headers: headers(cookie, "https://one.prat.idf.il/calendar", true),
    body: JSON.stringify({ month, year }),
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, auth_expired: true, reports: [], error: "הסשן פג תוקף" };
  }
  if (!response.ok) {
    return { ok: false, reports: [], error: `שגיאה (${response.status})` };
  }
  const data = await response.json();
  const days = Array.isArray(data?.days) ? data.days : Array.isArray(data) ? data : [];
  const reports = [];
  for (const day of days) {
    if (!day || typeof day !== "object" || !dayHasReport(day)) continue;
    const iso = normalizeDayDate(day.date || day.Date);
    if (!iso) continue;
    reports.push({
      date: iso,
      date_prat: isoToPrat(iso),
      main: day.reportedMainName || day.mainStatusReported || "",
      secondary: day.secondaryStatusReported || day.reportedSecondaryName || "",
      status_code: day.reportedStatusCode || "",
      icon: day.icon,
    });
  }
  return {
    ok: true,
    reports,
    auth_expired: false,
    minDate: data?.minDate ?? null,
    maxDate: data?.maxDate ?? null,
  };
}

export async function getFutureReports(cookie: string, monthsAhead = 3) {
  const now = new Date();
  const all: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  let minDate = null;
  let maxDate = null;
  for (let offset = 0; offset < Math.max(1, monthsAhead); offset++) {
    let month = now.getMonth() + 1 + offset;
    let year = now.getFullYear();
    while (month > 12) {
      month -= 12;
      year += 1;
    }
    const payload = await getFutureReportsMonth(cookie, month, year);
    if (payload.auth_expired) return payload;
    if (!payload.ok) return payload;
    if (payload.minDate && !minDate) minDate = payload.minDate;
    if (payload.maxDate) maxDate = payload.maxDate;
    for (const report of payload.reports || []) {
      const key = report.date;
      if (key && !seen.has(key)) {
        seen.add(key);
        all.push(report);
      }
    }
  }
  all.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { ok: true, reports: all, auth_expired: false, minDate, maxDate };
}

export async function deleteFutureReport(cookie: string, datePrat: string) {
  const url = `${BASE}/api/Attendance/deleteFutureReport?dateToDelete=${encodeURIComponent(datePrat)}`;
  const response = await pratFetch(url, {
    method: "POST",
    headers: headers(cookie, "https://one.prat.idf.il/calendar", false),
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: "auth_expired", message: "הסשן פג תוקף", http_status: response.status };
  }
  if (response.ok) {
    return { ok: true, status: "success", message: "הדיווח נמחק", http_status: response.status };
  }
  const body = await response.json().catch(() => ({}));
  return {
    ok: false,
    status: "rejected",
    message: body.message || body.error || `שגיאה (${response.status})`,
    http_status: response.status,
  };
}

export async function insertFutureReport(
  cookie: string,
  mainCode: string,
  secondaryCode: string,
  futureReportDate: string,
  note = "",
) {
  const form = new FormData();
  form.append("MainCode", String(mainCode));
  form.append("SecondaryCode", String(secondaryCode));
  form.append("Note", note || "");
  form.append("FutureReportDate", String(futureReportDate));
  const response = await pratFetch(`${BASE}/api/Attendance/InsertFutureReport`, {
    method: "POST",
    headers: {
      ...headers(cookie, "https://one.prat.idf.il/uploadFiles", false),
    },
    body: form,
  });
  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: "auth_expired", message: "הסשן פג תוקף", http_status: response.status };
  }
  // Upstream returns HTTP 200 with JSON `true`/`false` — false means not persisted
  // (dates beyond ~7-day write window). Never treat bare HTTP 200 as success.
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.ok && body === true) {
    return { ok: true, status: "success", message: "הדיווח נשמר", http_status: response.status };
  }
  if (response.ok && body === false) {
    return {
      ok: false,
      status: "rejected",
      message: "התאריך מחוץ לחלון הדיווח העתידי (כשבוע קדימה)",
      http_status: response.status,
    };
  }
  const err =
    body && typeof body === "object"
      ? (body as { message?: string; error?: string; title?: string })
      : null;
  return {
    ok: false,
    status: "rejected",
    message: err?.message || err?.error || err?.title || `שגיאה (${response.status})`,
    http_status: response.status,
  };
}

export async function fetchMonthData(cookie: string, month: number, year: number) {
  const response = await pratFetch(`${BASE}/api/Attendance/memberHistory`, {
    method: "POST",
    headers: headers(cookie, "https://one.prat.idf.il/history", true),
    body: JSON.stringify({ month, year }),
  });
  if (!response.ok) return [];
  const data = await response.json();
  if (Array.isArray(data?.days)) return data.days.filter((d: unknown) => d && typeof d === "object");
  if (Array.isArray(data)) return data.filter((d) => d && typeof d === "object");
  return [];
}

export { isoToPrat };
