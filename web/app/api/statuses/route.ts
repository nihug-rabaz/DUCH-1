import { NextResponse } from "next/server";
import { getFilterStatuses } from "@/lib/attendance";

export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const cookie = String(data.cookie || "").trim();
    if (!cookie) return NextResponse.json({ error: "Cookie is required" }, { status: 400 });
    const { status, data: body } = await getFilterStatuses(cookie);
    if (status === 401 || status === 403) {
      return NextResponse.json({ auth_expired: true, error: "הסשן פג תוקף" }, { status: 401 });
    }
    return NextResponse.json({ ok: true, statuses: body, http_status: status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
