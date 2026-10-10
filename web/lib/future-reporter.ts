import { deleteFutureReport, getFutureReports, insertFutureReport, isoToPrat } from "./attendance";

export async function reportBatch(
  cookie: string,
  dates: string[],
  mainCode: string,
  secondaryCode: string,
  note = "",
  skipDuplicates = true,
) {
  const results: Array<Record<string, unknown>> = [];
  let known = new Set<string>();

  if (skipDuplicates) {
    const future = await getFutureReports(cookie, 3);
    if (future.auth_expired) {
      return dates.map((date) => ({
        date: String(date).slice(0, 10),
        status: "auth_expired",
        message: "הסשן פג תוקף",
      }));
    }
    if (!future.ok) {
      return dates.map((date) => ({
        date: String(date).slice(0, 10),
        status: "rejected",
        message: "לא ניתן לבדוק דיווחים קיימים",
      }));
    }
    known = new Set(
      (future.reports || []).map((r) => String((r as { date?: string }).date || "")).filter(Boolean),
    );
  }

  for (const date of dates) {
    const iso = String(date).slice(0, 10);
    if (skipDuplicates && known.has(iso)) {
      results.push({
        date: iso,
        status: "skipped_duplicate",
        message: "כבר קיים דיווח עתידי לתאריך זה",
      });
      continue;
    }
    try {
      const prat = isoToPrat(iso);
      const response = await insertFutureReport(cookie, mainCode, secondaryCode, prat, note);
      results.push({ date: iso, ...response });
      if (response.ok) known.add(iso);
    } catch (e) {
      results.push({
        date: iso,
        status: "rejected",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

export async function deleteBatch(cookie: string, dates: string[]) {
  const results = [];
  for (const date of dates) {
    const iso = String(date).slice(0, 10);
    let prat = iso;
    if (iso.includes("-")) prat = isoToPrat(iso);
    const response = await deleteFutureReport(cookie, prat);
    results.push({ date: iso, ...response });
  }
  return results;
}
