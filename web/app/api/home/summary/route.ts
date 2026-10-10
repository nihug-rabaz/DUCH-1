import { NextResponse } from "next/server";
import { getFutureReports, getReportedData, validateSession } from "@/lib/attendance";

export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const cookie = String(data.cookie || "").trim();
    if (!cookie) {
      return NextResponse.json({ error: "Cookie is required" }, { status: 400 });
    }
    const session = await validateSession(cookie);
    if (!session.ok) {
      return NextResponse.json(session, { status: session.auth_expired ? 401 : 400 });
    }
    const reported = await getReportedData(cookie);
    if (reported?.auth_expired) {
      return NextResponse.json({ auth_expired: true, error: "הסשן פג תוקף" }, { status: 401 });
    }
    const future = await getFutureReports(cookie, 3);
    return NextResponse.json({
      ok: true,
      user_name: session.user_name || "",
      reported,
      future_reports: future.reports || [],
      future_ok: future.ok,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
