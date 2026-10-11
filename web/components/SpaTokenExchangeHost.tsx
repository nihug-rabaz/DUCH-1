"use client";

import { useEffect, useRef } from "react";
import {
  exchangeAuthorizationCode,
  type MicrosoftTokenResponse,
  MS_CLIENT_ID,
  MS_REDIRECT_URI,
} from "@/lib/ms-oauth-browser";

type Props = {
  code: string;
  codeVerifier: string;
  redirectUri?: string;
  clientId?: string;
  onSuccess: (tokens: MicrosoftTokenResponse) => void;
  onError: (message: string) => void;
};

/** HOGER IdfProfileSpaTokenExchangeHost.web — redeem in browser, then hand tokens up. */
export function SpaTokenExchangeHost({
  code,
  codeVerifier,
  redirectUri = MS_REDIRECT_URI,
  clientId = MS_CLIENT_ID,
  onSuccess,
  onError,
}: Props) {
  const finished = useRef(false);

  useEffect(() => {
    if (finished.current || !code || !codeVerifier) return;
    finished.current = true; // arm before await — avoid double redeem
    void exchangeAuthorizationCode(code, codeVerifier, redirectUri, clientId)
      .then((tokens) => onSuccess(tokens))
      .catch((e) => onError(e instanceof Error ? e.message : String(e)));
  }, [code, codeVerifier, redirectUri, clientId, onSuccess, onError]);

  return null;
}
