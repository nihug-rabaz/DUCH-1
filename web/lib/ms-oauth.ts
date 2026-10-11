import { createHash, randomBytes, randomUUID } from "crypto";
import {
  MS_CLIENT_ID,
  MS_REDIRECT_URI,
  MS_SCOPE,
  MS_TENANT_ID,
} from "@/lib/ms-oauth-browser";

export {
  CA_BLOCK_MESSAGE_HE,
  exchangeAuthorizationCode,
  isConditionalAccessError,
  jwtForPratLogin,
  MS_CLIENT_ID,
  MS_PAGE_ORIGIN,
  MS_REDIRECT_URI,
  MS_SCOPE,
  parseRedirectUrl,
} from "@/lib/ms-oauth-browser";

function authorizationEndpoint() {
  return `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/authorize`;
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
    client_id: MS_CLIENT_ID,
    scope: MS_SCOPE,
    redirect_uri: MS_REDIRECT_URI,
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
    redirectUri: MS_REDIRECT_URI,
    clientId: MS_CLIENT_ID,
  };
}
