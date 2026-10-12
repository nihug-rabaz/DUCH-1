import { NextResponse } from "next/server";
import { loginWithMsToken } from "@/lib/prat-auth";
import { validateSession } from "@/lib/attendance";

/** Fallback: paste Microsoft JWT → Prat account/login → AppCookie. */
export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const msToken = String(data.ms_token || data.authorization || "").trim();
    const bootstrap = String(data.bootstrap_cookie || data.cookie || "").trim();
    if (!msToken) {
      return NextResponse.json({ error: "ms_token is required" }, { status: 400 });
    }

    const result = await loginWithMsToken(msToken, bootstrap);
    if (!result.ok || !result.cookie) {
      return NextResponse.json(
        {
          error: result.error || "התחברות נכשלה",
          http_status: result.http_status,
        },
        { status: 401 },
      );
    }

    const validated = await validateSession(result.cookie);
    if (!validated.ok) {
      return NextResponse.json(
        {
          error: validated.error || "הסשן שנוצר לא תקף מול Attendance",
          auth_expired: validated.auth_expired,
        },
        { status: 401 },
      );
    }

    return NextResponse.json({
      ok: true,
      cookie: result.cookie,
      user_name: validated.user_name || result.user_name || "",
      has_app_cookie: result.has_app_cookie || false,
      auth_mode: "ms-login",
      expires_at: result.expires_at ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
