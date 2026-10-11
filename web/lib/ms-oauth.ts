import { createHash, randomBytes, randomUUID } from "crypto";

const TENANT_ID = "78820852-55fa-450b-908d-45c0d911e76b";
const CLIENT_ID = "f39dfb4b-6a50-42a5-98aa-829fc7414a10";
const REDIRECT_URI = "https://one.prat.idf.il";
const SCOPE = "User.Read openid profile offline_access";
const REDIRECT_MARKERS = ["https://one.prat.idf.il/", "https://one.prat.idf.il"];

function authorizationEndpoint() {
  return `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
}

function tokenEndpoint() {
  return `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
}

export function generateVerifier(): string {
  return randomBytes(32).toString("base64url").replace(/=/g, "");
}

export function challengeFromVerifier(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function buildAuthUrl(idNumber: string, codeVerifier: string) {
  const digits = (idNumber || "").replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 16) {
    throw new Error("invalid_id_number");
  }
  const upn = `${digits}@idf.il`;
  const challenge = challengeFromVerifier(codeVerifier);
  const state = Buffer.from(
    JSON.stringify({ id: randomUUID(), meta: { interactionType: "redirect" } }),
  ).toString("base64");
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    scope: SCOPE,
    redirect_uri: REDIRECT_URI,
    response_mode: "fragment",
    response_type: "code",
    login_hint: upn,
    "X-AnchorMailbox": `UPN:${upn}`,
    nonce: randomUUID(),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    prompt: "select_account",
  });
  return {
    authUrl: `${authorizationEndpoint()}?${params.toString()}`,
    codeVerifier,
    redirectUri: REDIRECT_URI,
    clientId: CLIENT_ID,
  };
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
      url = `${REDIRECT_URI}/#${normalized.replace(/^#/, "")}`;
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
  return { code, state: param(paramsText, "state") || "", redirectUri: REDIRECT_URI };
}

export async function exchangeCode(code: string, codeVerifier: string) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier,
    scope: SCOPE,
  });
  const response = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://one.prat.idf.il",
      referer: "https://one.prat.idf.il/",
    },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, string>;
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `token_exchange_${response.status}`);
  }
  if (!data.id_token && !data.access_token) {
    throw new Error("token_exchange:no_tokens");
  }
  return data;
}

export function jwtForPratLogin(tokens: Record<string, string>) {
  return (tokens.id_token || tokens.access_token || "").trim();
}

/** True when Entra Conditional Access blocked token issuance (common on cloud egress). */
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
  "מדיניות Conditional Access של הארגון חוסמת המרת טוקן משרת הענן (Vercel). " +
  "ההתחברות ב־Microsoft הצליחה, אבל ההמרה מהשרת נחסמה. " +
  "השתמשו בגיבוי: הדביקו Cookie מ־one.prat (כולל AppCookie) או JWT.";
