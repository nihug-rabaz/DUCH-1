import { NextResponse } from "next/server";
import { jwtForPratLogin } from "@/lib/ms-oauth-browser";
import { loginWithMsToken } from "@/lib/prat-auth";
import { validateSession } from "@/lib/attendance";

/**
 * HOGER-style: server accepts MS tokens only.
 * Code + code_verifier must be redeemed on-device (browser), never here.
 */
export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const code = String(data.code || "").trim();
    const codeVerifier = String(data.code_verifier || data.codeVerifier || "").trim();
    const pastedUrl = String(data.pasted_url || data.redirect_url || "").trim();
    const bootstrap = String(data.bootstrap_cookie || "").trim();

    // Reject server-side SPA redeem (HOGER idf-profile/import)
    if ((code && codeVerifier) || (pastedUrl && codeVerifier)) {
      return NextResponse.json(
        {
          error: "spa_token_exchange_on_device",
          message: "יש להמיר את ה־code בדפדפן (כמו בחוגר), לא בשרת",
        },
        { status: 400 },
      );
    }

    const idToken = String(data.id_token || "").trim();
    const accessToken = String(data.access_token || "").trim();
    const msJwt = jwtForPratLogin({ id_token: idToken, access_token: accessToken });
    if (!msJwt) {
      return NextResponse.json({ error: "tokens_required" }, { status: 400 });
    }

    const result = await loginWithMsToken(msJwt, bootstrap);
    if (!result.ok || !result.cookie) {
      return NextResponse.json(
        {
          error: result.error || "account/login נכשל אחרי OAuth",
          http_status: result.http_status,
        },
        { status: 401 },
      );
    }

    const validated = await validateSession(result.cookie);
    if (!validated.ok) {
      return NextResponse.json(
        {
          error: validated.error || "הסשן שנוצר לא תקף",
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
      auth_mode: "oauth-paste-url",
      expires_at: result.expires_at ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
