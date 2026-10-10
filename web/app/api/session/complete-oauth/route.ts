import { NextResponse } from "next/server";
import { exchangeCode, jwtForPratLogin, parseRedirectUrl } from "@/lib/ms-oauth";
import { loginWithMsToken } from "@/lib/prat-auth";
import { validateSession } from "@/lib/attendance";

export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const pastedUrl = String(data.pasted_url || data.redirect_url || "").trim();
    const codeVerifier = String(data.code_verifier || data.codeVerifier || "").trim();
    const bootstrap = String(data.bootstrap_cookie || "").trim();
    if (!pastedUrl || !codeVerifier) {
      return NextResponse.json(
        { error: "pasted_url and code_verifier are required" },
        { status: 400 },
      );
    }

    const parsed = parseRedirectUrl(pastedUrl);
    const tokens = await exchangeCode(parsed.code, codeVerifier);
    const msJwt = jwtForPratLogin(tokens);
    if (!msJwt) {
      return NextResponse.json({ error: "token_exchange:no_tokens" }, { status: 401 });
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
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("authorization_") || msg.includes("invalid") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
