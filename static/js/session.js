(function (global) {
  const SESSION_KEY = 'duch1_session';

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function getCookie() {
    const session = getSession();
    return session && session.cookie ? session.cookie : '';
  }

  function hasSession() {
    return Boolean(getCookie());
  }

  function setSession(cookie, meta) {
    const payload = {
      cookie: (cookie || '').trim(),
      savedAt: Date.now(),
      valid: true,
      ...(meta || {})
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  }

  function markInvalid() {
    const session = getSession();
    if (!session) return;
    session.valid = false;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function requireSession(redirectUrl) {
    if (!hasSession()) {
      window.location.href = redirectUrl || '/login';
      return false;
    }
    return true;
  }

  async function apiPost(url, body) {
    const cookie = getCookie();
    if (!cookie) {
      return { ok: false, status: 401, data: { error: 'אין סשן פעיל' } };
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookie, ...(body || {}) })
    });
    let data = {};
    try {
      data = await response.json();
    } catch (e) {
      data = { error: 'תשובה לא תקינה מהשרת' };
    }
    if (response.status === 401 || data.auth_expired) {
      markInvalid();
    }
    return { ok: response.ok, status: response.status, data };
  }

  async function validateSession() {
    const result = await apiPost('/api/session/validate', {});
    if (!result.ok) {
      markInvalid();
      return { ok: false, error: (result.data && result.data.error) || 'הסשן לא תקף' };
    }
    const session = getSession() || {};
    session.valid = true;
    session.userName = result.data.user_name || session.userName || '';
    session.validatedAt = Date.now();
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { ok: true, data: result.data };
  }

  function updateSessionBadge() {
    const badge = document.getElementById('session-badge');
    if (!badge) return;
    const session = getSession();
    if (!session || !session.cookie) {
      badge.textContent = 'לא מחובר';
      badge.className = 'session-badge expired';
      return;
    }
    if (session.valid === false) {
      badge.textContent = 'פג תוקף';
      badge.className = 'session-badge expired';
      return;
    }
    badge.textContent = session.userName ? `מחובר · ${session.userName}` : 'מחובר';
    badge.className = 'session-badge connected';
  }

  global.DuchSession = {
    getSession,
    getCookie,
    hasSession,
    setSession,
    clearSession,
    markInvalid,
    requireSession,
    apiPost,
    validateSession,
    updateSessionBadge,
    SESSION_KEY
  };
})(window);
