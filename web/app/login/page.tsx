"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BrandTitle } from "@/components/BrandTitle";
import { SpaTokenExchangeHost } from "@/components/SpaTokenExchangeHost";
import { BRAND_TITLE_HE } from "@/lib/brand";
import {
  CA_BLOCK_MESSAGE_HE,
  isConditionalAccessError,
  parseRedirectUrl,
  type MicrosoftTokenResponse,
} from "@/lib/ms-oauth-browser";
import {
  clearOAuthPending,
  clearSession,
  getOAuthPending,
  getSession,
  setOAuthPending,
  setSession,
} from "@/lib/session";

type PendingExchange = { code: string; codeVerifier: string };

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [idNumber, setIdNumber] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
  const [fallbackSecret, setFallbackSecret] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const [pendingExchange, setPendingExchange] = useState<PendingExchange | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (session?.cookie && session.valid !== false) {
      router.replace("/home");
    }
    const pending = getOAuthPending();
    if (pending?.idNumber) setIdNumber(pending.idNumber);
  }, [router]);

  const goHome = useCallback(
    (cookie: string, userName: string, authMode: string) => {
      setSession(cookie, { userName, authMode });
      clearOAuthPending();
      setPendingExchange(null);
      setSuccess("התחברת בהצלחה");
      setTimeout(() => router.push("/home"), 600);
    },
    [router],
  );

  async function startAuth() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/session/auth-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_number: idNumber }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "לא ניתן להתחיל התחברות");
      setAuthUrl(data.authUrl);
      setOAuthPending({ codeVerifier: data.codeVerifier, idNumber });
      setStep(2);
      window.open(data.authUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function beginDeviceExchange() {
    setError("");
    setSuccess("");
    try {
      const pending = getOAuthPending();
      if (!pending?.codeVerifier) {
        throw new Error("חסר code_verifier — התחילו מחדש משלב תעודת הזהות");
      }
      const parsed = parseRedirectUrl(redirectUrl);
      setBusy(true);
      // HOGER: redeem on device, then POST tokens only
      setPendingExchange({ code: parsed.code, codeVerifier: pending.codeVerifier });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  const onTokens = useCallback(
    async (tokens: MicrosoftTokenResponse) => {
      try {
        const response = await fetch("/api/session/complete-oauth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id_token: tokens.id_token || "",
            access_token: tokens.access_token || "",
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.cookie) {
          throw new Error(data.error || data.message || "התחברות נכשלה");
        }
        goHome(data.cookie, data.user_name || "", data.auth_mode || "oauth-paste-url");
      } catch (e) {
        setPendingExchange(null);
        setError(e instanceof Error ? e.message : String(e));
        setBusy(false);
      }
    },
    [goHome],
  );

  const onExchangeError = useCallback((message: string) => {
    setPendingExchange(null);
    setBusy(false);
    if (isConditionalAccessError(message)) {
      setShowFallback(true);
      setError(CA_BLOCK_MESSAGE_HE);
      return;
    }
    setShowFallback(true);
    setError(message || "המרת טוקן נכשלה");
  }, []);

  async function completeFallback() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const raw = fallbackSecret.trim();
      if (!raw) throw new Error("הדביקו Cookie או JWT");

      const looksLikeJwt = raw.split(".").length >= 3 && !raw.includes("AppCookie=");
      if (looksLikeJwt) {
        const response = await fetch("/api/session/ms-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ms_token: raw }),
        });
        const data = await response.json();
        if (!response.ok || !data.cookie) {
          throw new Error(data.error || "התחברות עם JWT נכשלה");
        }
        goHome(data.cookie, data.user_name || "", data.auth_mode || "ms-login");
        return;
      }

      if (!raw.includes("AppCookie=")) {
        throw new Error("ה־Cookie חייב לכלול AppCookie= (מהדביקו מ־DevTools ב־one.prat)");
      }
      const response = await fetch("/api/session/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookie: raw }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "אימות Cookie נכשל");
      goHome(raw, data.user_name || "", "cookie-paste");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell showNav={false}>
      {pendingExchange ? (
        <SpaTokenExchangeHost
          code={pendingExchange.code}
          codeVerifier={pendingExchange.codeVerifier}
          onSuccess={onTokens}
          onError={onExchangeError}
        />
      ) : null}

      <section className="login-section">
        <div className="login-hero">
          <div className="login-brand">
            <BrandTitle className="login-brand-title" />
          </div>
          <p className="login-sub">גרסת פלוס לדו״ח 1 — אותה חוויה, עם דיווח מרוכז</p>
        </div>

        <div className="login-box">
          <div className="login-steps" aria-label="שלבי התחברות">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`login-step-dot ${step === n ? "active" : ""} ${step > n ? "done" : ""}`}
              >
                {n}
              </span>
            ))}
          </div>

          {step === 1 ? (
            <div className="stack tight">
              <h1 className="login-title">התחברות</h1>
              <p className="help center">הזינו תעודת זהות להמשך התחברות Microsoft</p>
              <div className="field">
                <label htmlFor="id-number">תעודת זהות</label>
                <input
                  id="id-number"
                  className="form-control"
                  inputMode="numeric"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value)}
                  placeholder="9 ספרות"
                  autoComplete="username"
                />
              </div>
              {error ? <div className="notice error">{error}</div> : null}
              <button className="btn-general send" type="button" disabled={busy || idNumber.length < 5} onClick={startAuth}>
                המשך
              </button>
              <button className="text-link" type="button" onClick={() => setShowFallback(true)}>
                גיבוי: Cookie / JWT
              </button>
              <button
                className="text-link"
                type="button"
                onClick={() => {
                  clearSession();
                  clearOAuthPending();
                }}
              >
                נקה סשן מקומי
              </button>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="stack tight">
              <h1 className="login-title">Microsoft</h1>
              <p className="help center">
                אחרי ההתחברות — העתיקו את כל הקישור משורת הכתובת, כולל <code>#code=</code>
              </p>
              <div className="notice info">כמו בחוגר: ההמרה לטוקן מתבצעת במכשיר שלכם, לא בשרת</div>
              <button
                className="btn-general send"
                type="button"
                onClick={() => authUrl && window.open(authUrl, "_blank", "noopener,noreferrer")}
              >
                פתח התחברות Microsoft
              </button>
              <button className="btn-general welcome" type="button" onClick={() => setStep(3)}>
                העתקתי קישור — המשך
              </button>
              <button className="text-link" type="button" onClick={() => setStep(1)}>
                חזרה
              </button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="stack tight">
              <h1 className="login-title">הדבקת קישור</h1>
              <div className="field">
                <label htmlFor="redirect-url">קישור החזרה</label>
                <textarea
                  id="redirect-url"
                  className="form-control ltr"
                  value={redirectUrl}
                  onChange={(e) => setRedirectUrl(e.target.value)}
                  placeholder="https://one.prat.idf.il/#code=..."
                />
              </div>
              <p className="help">
                נמיר את ה־code לטוקן בדפדפן (כמו בחוגר), ואז ניצור סשן {BRAND_TITLE_HE}
              </p>
              {error ? <div className="notice error">{error}</div> : null}
              {success ? <div className="notice success">{success}</div> : null}
              <button
                className="btn-general send"
                type="button"
                disabled={busy || !redirectUrl.includes("code=")}
                onClick={beginDeviceExchange}
              >
                {busy && pendingExchange ? "ממיר טוקן…" : "התחבר"}
              </button>
              <button className="text-link" type="button" onClick={() => setShowFallback(true)}>
                לא עובד? גיבוי Cookie / JWT
              </button>
              <button className="text-link" type="button" onClick={() => setStep(2)}>
                חזרה
              </button>
            </div>
          ) : null}

          {showFallback ? (
            <div className="stack tight fallback-panel">
              <h2 className="login-title">גיבוי התחברות</h2>
              <p className="help">
                התחברו ל־one.prat.idf.il כרגיל → DevTools → Application → Cookies → העתיקו את כל שורת
                ה־Cookie (חייבת לכלול <code>AppCookie=</code>), או הדביקו JWT מ־Microsoft.
              </p>
              <div className="field">
                <label htmlFor="fallback-secret">Cookie מלא או JWT</label>
                <textarea
                  id="fallback-secret"
                  className="form-control ltr"
                  value={fallbackSecret}
                  onChange={(e) => setFallbackSecret(e.target.value)}
                  placeholder="AppCookie=...; או eyJ..."
                />
              </div>
              {error ? <div className="notice error">{error}</div> : null}
              {success ? <div className="notice success">{success}</div> : null}
              <button
                className="btn-general send"
                type="button"
                disabled={busy || !fallbackSecret.trim()}
                onClick={completeFallback}
              >
                התחבר עם גיבוי
              </button>
              <button className="text-link" type="button" onClick={() => setShowFallback(false)}>
                סגור גיבוי
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
