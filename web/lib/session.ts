"use client";

export type DuchSession = {
  cookie: string;
  savedAt: number;
  valid: boolean;
  userName?: string;
  authMode?: string;
  /** Epoch ms from Prat AppCookie Max-Age/Expires when known. */
  expiresAt?: number | null;
};

const SESSION_KEY = "duch1_session";
const PENDING_KEY = "duch1_oauth_pending";

export function getSession(): DuchSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DuchSession;
  } catch {
    return null;
  }
}

export function getCookie(): string {
  return getSession()?.cookie || "";
}

export function hasSession(): boolean {
  return Boolean(getCookie());
}

export function setSession(cookie: string, meta?: Partial<DuchSession>) {
  const payload: DuchSession = {
    cookie: (cookie || "").trim(),
    savedAt: Date.now(),
    valid: true,
    ...meta,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function markInvalid() {
  const session = getSession();
  if (!session) return;
  session.valid = false;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function setOAuthPending(data: { codeVerifier: string; idNumber: string }) {
  localStorage.setItem(PENDING_KEY, JSON.stringify(data));
}

export function getOAuthPending(): { codeVerifier: string; idNumber: string } | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearOAuthPending() {
  localStorage.removeItem(PENDING_KEY);
}

export async function apiPost<T = Record<string, unknown>>(
  url: string,
  body?: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: T }> {
  const cookie = getCookie();
  if (!cookie) {
    return { ok: false, status: 401, data: { error: "אין סשן פעיל" } as T };
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cookie, ...(body || {}) }),
  });
  let data = {} as T;
  try {
    data = (await response.json()) as T;
  } catch {
    data = { error: "תשובה לא תקינה מהשרת" } as T;
  }
  if (response.status === 401 || (data as { auth_expired?: boolean }).auth_expired) {
    markInvalid();
  }
  return { ok: response.ok, status: response.status, data };
}
