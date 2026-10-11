import { pratFetch, pratProxyConfigured } from "@/lib/prat-fetch";

const BASE = "https://one.prat.idf.il";
const LOGIN_PAGE = `${BASE}/login`;
const LOGIN_URL = `${BASE}/api/account/login`;

const UA =
  "Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36";

function mergeCookies(existing: string, setCookieHeaders: string[]): string {
  const jar = new Map<string, string>();
  for (const part of (existing || "").split(";")) {
    const p = part.trim();
    if (!p || !p.includes("=")) continue;
    const [name, ...rest] = p.split("=");
    jar.set(name.trim(), rest.join("=").trim());
  }
  for (const header of setCookieHeaders) {
    const first = header.split(";")[0]?.trim() || "";
    if (!first.includes("=")) continue;
    const [name, ...rest] = first.split("=");
    jar.set(name.trim(), rest.join("=").trim());
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function cookiesFromResponse(response: Response): string[] {
  const headers: string[] = [];
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    headers.push(...getSetCookie.call(response.headers));
  } else {
    const single = response.headers.get("set-cookie");
    if (single) headers.push(single);
  }
  return headers;
}

function jarFromSetCookie(headers: string[]): string {
  return mergeCookies("", headers);
}

export type PratLoginResult = {
  ok: boolean;
  cookie?: string;
  user_name?: string;
  error?: string;
  http_status: number;
  has_app_cookie?: boolean;
};

export async function loginWithMsToken(
  msJwt: string,
  bootstrapCookie = "",
): Promise<PratLoginResult> {
  let token = (msJwt || "").trim();
  if (token.toLowerCase().startsWith("bearer ")) token = token.slice(7).trim();
  if (!token || token.split(".").length < 3) {
    return {
      ok: false,
      error: "נא להדביק JWT תקין מ-Microsoft (authorization)",
      http_status: 0,
    };
  }

  let cookieJar = bootstrapCookie.trim();

  try {
    if (process.env.VERCEL === "1" && !pratProxyConfigured()) {
      return {
        ok: false,
        error:
          "חסר פרוקסי לישראל (API_PROXY_*) בפרודקשן — one.prat חוסם IP של Vercel (403)",
        http_status: 0,
      };
    }

    const warm = await pratFetch(LOGIN_PAGE, {
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    });
    cookieJar = mergeCookies(cookieJar, cookiesFromResponse(warm));

    const response = await pratFetch(LOGIN_URL, {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
        Authorization: token,
        crossdomain: "true",
        origin: "https://one.prat.idf.il",
        pragma: "no-cache",
        referer: "https://one.prat.idf.il/login",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": UA,
        ...(cookieJar ? { cookie: cookieJar } : {}),
      },
      redirect: "manual",
    });

    cookieJar = mergeCookies(cookieJar, cookiesFromResponse(response));
    // Also absorb any cookies encoded in jarFromSetCookie for clarity
    void jarFromSetCookie;

    let body: Record<string, unknown> | null = null;
    try {
      const text = await response.text();
      if (text) body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = null;
    }

    const hasApp = cookieJar.includes("AppCookie=");
    let userName = "";
    if (body) {
      userName = String(
        body.fullName || body.name || body.displayName || "",
      );
      const result = body.result;
      if (!userName && result && typeof result === "object") {
        const r = result as Record<string, unknown>;
        userName = String(r.fullName || r.name || "");
      }
    }

    if (response.ok && (hasApp || cookieJar)) {
      return {
        ok: true,
        cookie: cookieJar,
        user_name: userName,
        http_status: response.status,
        has_app_cookie: hasApp,
      };
    }

    let err = `login נכשל (${response.status})`;
    if (response.status === 403) {
      err =
        "login נכשל (403): one.prat חסם את הבקשה — בדקו ש־API_PROXY_* מוגדר בפרודקשן (כמו בחוגר).";
    }
    if (response.status === 404) {
      err =
        "login נכשל (404): ה-SPA משתמש ב-GET /api/account/login — ייתכן חסימת WAF.";
    }
    if (body) {
      err = String(body.error || body.message || body.statusDescription || err);
    }
    return { ok: false, error: err, http_status: response.status, cookie: cookieJar };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), http_status: 0 };
  }
}
