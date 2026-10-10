import { NextResponse } from "next/server";
import { reportBatch } from "@/lib/future-reporter";

export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const cookie = String(data.cookie || "").trim();
    const dates = Array.isArray(data.dates) ? data.dates : [];
    const mainCode = String(data.main_code || data.mainCode || "").trim();
    const secondaryCode = String(data.secondary_code || data.secondaryCode || "0");
    const note = String(data.note || "");
    if (!cookie) return NextResponse.json({ error: "Cookie is required" }, { status: 400 });
    if (!dates.length) return NextResponse.json({ error: "dates required" }, { status: 400 });
    if (!mainCode) return NextResponse.json({ error: "main_code required" }, { status: 400 });

    const results = await reportBatch(cookie, dates, mainCode, secondaryCode, note, true);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
