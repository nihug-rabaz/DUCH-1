"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BrandTitle } from "@/components/BrandTitle";
import { BRAND_TITLE_HE } from "@/lib/brand";
import {
  clearOAuthPending,
  clearSession,
  getOAuthPending,
  getSession,
  setOAuthPending,
  setSession,
} from "@/lib/session";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [idNumber, setIdNumber] = useState("");
  const [authUrl, setAuthUrl] = useState("");
  const [redirectUrl, setRedirectUrl] = useState("");
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

  async function completeAuth() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const pending = getOAuthPending();
      if (!pending?.codeVerifier) {
        throw new Error("חסר code_verifier — התחילו מחדש משלב תעודת הזהות");
      }
      const response = await fetch("/api/session/complete-oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pasted_url: redirectUrl,
          code_verifier: pending.codeVerifier,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "התחברות נכשלה");
      setSession(data.cookie, {
        userName: data.user_name || "",
        authMode: data.auth_mode || "oauth-paste-url",
      });
      clearOAuthPending();
      setSuccess("התחברת בהצלחה");
      setTimeout(() => router.push("/home"), 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell showNav={false}>
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
              <div className="notice info">אל תסגרו את חלון Microsoft לפני שהכתובת חוזרת ל־one.prat</div>
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
              <p className="help">נזהה את ה־code, נמיר לטוקן, וניצור סשן {BRAND_TITLE_HE}</p>
              {error ? <div className="notice error">{error}</div> : null}
              {success ? <div className="notice success">{success}</div> : null}
              <button
                className="btn-general send"
                type="button"
                disabled={busy || !redirectUrl.includes("code=")}
                onClick={completeAuth}
              >
                התחבר
              </button>
              <button className="text-link" type="button" onClick={() => setStep(2)}>
                חזרה
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
