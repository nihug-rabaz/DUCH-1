import { NextResponse } from "next/server";
import { getFutureReports } from "@/lib/attendance";

export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const cookie = String(data.cookie || "").trim();
    if (!cookie) {
      return NextResponse.json({ error: "Cookie is required" }, { status: 400 });
    }
    const months = Number(data.months_ahead || data.monthsAhead || 3);
    const result = await getFutureReports(cookie, months);
    if (result.auth_expired) {
      return NextResponse.json(result, { status: 401 });
    }
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
