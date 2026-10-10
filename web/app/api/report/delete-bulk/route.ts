import { NextResponse } from "next/server";
import { deleteBatch } from "@/lib/future-reporter";

export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const cookie = String(data.cookie || "").trim();
    const dates = Array.isArray(data.dates) ? data.dates : [];
    if (!cookie) return NextResponse.json({ error: "Cookie is required" }, { status: 400 });
    if (!dates.length) return NextResponse.json({ error: "dates required" }, { status: 400 });
    const results = await deleteBatch(cookie, dates);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
