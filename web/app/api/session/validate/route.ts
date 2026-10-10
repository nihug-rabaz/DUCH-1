import { NextResponse } from "next/server";
import { validateSession } from "@/lib/attendance";

export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const cookie = String(data.cookie || "").trim();
    if (!cookie) {
      return NextResponse.json({ error: "Cookie is required", auth_expired: true }, { status: 400 });
    }
    const result = await validateSession(cookie);
    if (!result.ok) {
      return NextResponse.json(result, {
        status: result.auth_expired ? 401 : 400,
      });
    }
    return NextResponse.json({
      ok: true,
      user_name: result.user_name,
      statuses: result.statuses,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
