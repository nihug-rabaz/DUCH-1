/** one.prat persists future reports for ~7 inclusive calendar days from minDate. */
export const FUTURE_WRITE_DAYS = 7;

export function todayIsoLocal(timeZone = "Asia/Jerusalem"): string {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function normalizeIsoDate(raw: unknown): string {
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

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Last writable ISO date (inclusive). Do not use API maxDate — it overstates the write window. */
export function writeMaxFromMin(minDate: string | null | undefined): string | null {
  const min = normalizeIsoDate(minDate);
  if (!min) return null;
  return addDaysIso(min, FUTURE_WRITE_DAYS - 1);
}

/**
 * When bounds are unknown, return false so UI cannot select far-future days
 * before /api/future/list returns minDate.
 */
export function isWithinWriteWindow(
  iso: string,
  minDate: string | null | undefined,
  writeMax: string | null | undefined,
): boolean {
  const day = iso.slice(0, 10);
  const min = normalizeIsoDate(minDate);
  const max = normalizeIsoDate(writeMax);
  if (!min || !max) return false;
  return day >= min && day <= max;
}
