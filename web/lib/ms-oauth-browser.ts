/**
 * Browser-side Microsoft PKCE helpers — same pattern as HOGER
 * (MicrosoftTokenClient + IdfProfileSpaTokenExchangeHost.web.tsx).
 * Token redeem MUST run on-device; never from Vercel/server.
 */

export const MS_TENANT_ID = "78820852-55fa-450b-908d-45c0d911e76b";
export const MS_CLIENT_ID = "f39dfb4b-6a50-42a5-98aa-829fc7414a10";
export const MS_REDIRECT_URI = "https://one.prat.idf.il";
export const MS_SCOPE = "User.Read openid profile offline_access";
export const MS_PAGE_ORIGIN = "https://one.prat.idf.il/";

const REDIRECT_MARKERS = ["https://one.prat.idf.il/", "https://one.prat.idf.il"];

export function msTokenEndpoint() {
  return `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`;
}

function param(paramsText: string, name: string): string | null {
  const prefix = `${name}=`;
  const idx = paramsText.indexOf(prefix);
  if (idx === -1) return null;
  const start = idx + prefix.length;
  const end = paramsText.indexOf("&", start);
  const raw = end === -1 ? paramsText.slice(start) : paramsText.slice(start, end);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function extractCode(paramsText: string): string | null {
  const prefix = "code=";
  const idx = paramsText.indexOf(prefix);
  if (idx === -1) return null;
  const start = idx + prefix.length;
  const boundaries = [
    "&client_info=",
    "&state=",
    "&session_state=",
    "&error=",
    "&error_description=",
  ];
  let end = paramsText.length;
  for (const boundary of boundaries) {
    const pos = paramsText.indexOf(boundary, start);
    if (pos !== -1 && pos < end) end = pos;
  }
  const code = paramsText.slice(start, end);
  return code.length >= 8 ? code : null;
}

export function parseRedirectUrl(raw: string) {
  const normalized = (raw || "").trim().replace(/\s+/g, "");
  if (!normalized) throw new Error("authorization_url_missing");

  const lower = normalized.toLowerCase();
  let url: string | null = null;
  for (const marker of REDIRECT_MARKERS) {
    const idx = lower.indexOf(marker.toLowerCase());
    if (idx !== -1) {
      url = normalized.slice(idx);
      break;
    }
  }
  if (!url) {
    if (normalized.includes("code=")) {
      url = `${MS_REDIRECT_URI}/#${normalized.replace(/^#/, "")}`;
    } else {
      throw new Error("authorization_url_missing");
    }
  }

  const hashIdx = url.indexOf("#");
  const queryIdx = url.indexOf("?");
  let paramsText = "";
  if (hashIdx !== -1) paramsText = url.slice(hashIdx + 1);
  else if (queryIdx !== -1) paramsText = url.slice(queryIdx + 1);
  else throw new Error("authorization_params_missing");

  const err = param(paramsText, "error");
  if (err) {
    throw new Error(`${err}:${param(paramsText, "error_description") || ""}`);
  }
  const code = extractCode(paramsText);
  if (!code) throw new Error("authorization_code_missing");
  return { code, state: param(paramsText, "state") || "", redirectUri: MS_REDIRECT_URI };
}

export type MicrosoftTokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
};

/** HOGER MicrosoftTokenClient.exchangeAuthorizationCode — device IP, browser Origin. */
export async function exchangeAuthorizationCode(
  code: string,
  codeVerifier: string,
  redirectUri: string = MS_REDIRECT_URI,
  clientId: string = MS_CLIENT_ID,
): Promise<MicrosoftTokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: MS_SCOPE,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
    client_info: "1",
  });

  const response = await fetch(msTokenEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*",
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`token_exchange:${response.status}:${errorText.slice(0, 300)}`);
  }

  const tokens = (await response.json()) as MicrosoftTokenResponse;
  if (!tokens.id_token && !tokens.access_token) {
    throw new Error("token_exchange:no_tokens");
  }
  return tokens;
}

export function jwtForPratLogin(tokens: {
  id_token?: string;
  access_token?: string;
}): string {
  return (tokens.id_token || tokens.access_token || "").trim();
}

export function isConditionalAccessError(message: string): boolean {
  const text = (message || "").toUpperCase();
  return (
    text.includes("AADSTS53003") ||
    text.includes("CONDITIONAL ACCESS") ||
    text.includes("BLOCKEDBYCONDITIONALACCESS") ||
    text.includes("DOES NOT ALLOW TOKEN ISSUANCE")
  );
}

export const CA_BLOCK_MESSAGE_HE =
  "מדיניות Conditional Access חוסמת את המרת הטוקן. " +
  "נסו שוב מהרשת הארגונית, או השתמשו בגיבוי Cookie/JWT מ־one.prat.";
