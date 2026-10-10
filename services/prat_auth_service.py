"""
one.prat.idf.il account login — Wallet-style bridge.

Flow (confirmed from live SPA main.*.chunk.js):
  1. Warm Incapsula: GET https://one.prat.idf.il/login (or /)
     → BIGip / visid_incap / nlbi / incap_ses cookies
  2. GET /api/account/login  (axios.get; withCredentials)
     Header Authorization: <Microsoft JWT>   # raw JWT, not "Bearer ..."
  → Set-Cookie: AppCookie=... (session for Attendance APIs)
"""
from __future__ import annotations

import requests
from typing import Any, Dict, List


class PratAuthService:
    BASE = "https://one.prat.idf.il"
    LOGIN_PAGE = f"{BASE}/login"
    LOGIN_URL = f"{BASE}/api/account/login"

    @staticmethod
    def _merge_cookies(existing: str, set_cookie_headers: List[str]) -> str:
        jar: Dict[str, str] = {}
        for part in (existing or "").split(";"):
            part = part.strip()
            if not part or "=" not in part:
                continue
            name, value = part.split("=", 1)
            jar[name.strip()] = value.strip()

        for header in set_cookie_headers or []:
            # Set-Cookie: Name=Value; Path=/; HttpOnly
            first = header.split(";", 1)[0].strip()
            if "=" not in first:
                continue
            name, value = first.split("=", 1)
            jar[name.strip()] = value.strip()

        return "; ".join(f"{k}={v}" for k, v in jar.items())

    @staticmethod
    def _collect_set_cookies(response: requests.Response) -> List[str]:
        headers = []
        # requests may fold multiple Set-Cookie; prefer raw
        if hasattr(response.raw, "headers"):
            getlist = getattr(response.raw.headers, "getlist", None)
            if callable(getlist):
                headers = getlist("Set-Cookie") or getlist("set-cookie") or []
        if not headers:
            single = response.headers.get("Set-Cookie") or response.headers.get("set-cookie")
            if single:
                headers = [single]
        # Also pull from cookie jar built by requests
        for cookie in response.cookies:
            headers.append(f"{cookie.name}={cookie.value}")
        return headers

    @classmethod
    def _cookie_header_from_session(cls, session: requests.Session, extra: str = "") -> str:
        parts = [f"{c.name}={c.value}" for c in session.cookies]
        merged = cls._merge_cookies(extra, parts)
        return merged

    @classmethod
    def login_with_ms_token(
        cls,
        ms_jwt: str,
        bootstrap_cookie: str = "",
    ) -> Dict[str, Any]:
        """
        Exchange Microsoft JWT for one.prat AppCookie session.
        Returns { ok, cookie, user_name?, error?, http_status }
        """
        token = (ms_jwt or "").strip()
        # Allow accidental "Bearer " paste
        if token.lower().startswith("bearer "):
            token = token[7:].strip()
        if not token or token.count(".") < 2:
            return {"ok": False, "error": "נא להדביק JWT תקין מ-Microsoft (authorization)", "http_status": 0}

        headers = {
            "accept": "application/json, text/plain, */*",
            "accept-language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
            "access-control-allow-origin": "*",
            "Authorization": token,
            "crossdomain": "true",
            "origin": "https://one.prat.idf.il",
            "pragma": "no-cache",
            "referer": "https://one.prat.idf.il/login",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent": (
                "Mozilla/5.0 (Linux; Android 16; Pixel 10) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/154.0.0.0 Mobile Safari/537.36"
            ),
        }

        session = requests.Session()
        if bootstrap_cookie.strip():
            # Seed jar from caller-supplied bootstrap string
            for part in bootstrap_cookie.split(";"):
                part = part.strip()
                if "=" in part:
                    name, value = part.split("=", 1)
                    session.cookies.set(name.strip(), value.strip(), domain="one.prat.idf.il")

        try:
            # Warm Incapsula / load-balancer cookies before API login
            session.get(
                cls.LOGIN_PAGE,
                headers={
                    "user-agent": headers["user-agent"],
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "accept-language": headers["accept-language"],
                },
                timeout=30,
                allow_redirects=True,
            )
            if not session.cookies:
                session.get(
                    cls.BASE + "/",
                    headers={
                        "user-agent": headers["user-agent"],
                        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    },
                    timeout=30,
                    allow_redirects=True,
                )

            # Live SPA: axios.get("/api/account/login", { headers: { Authorization: jwt } })
            response = session.get(
                cls.LOGIN_URL,
                headers=headers,
                timeout=30,
                allow_redirects=False,
            )
        except requests.RequestException as e:
            return {"ok": False, "error": str(e), "http_status": 0}

        set_cookies = cls._collect_set_cookies(response)
        # Include any cookies already on the session (WAF + AppCookie)
        session_cookie_hdr = cls._cookie_header_from_session(session, bootstrap_cookie)
        cookie = cls._merge_cookies(session_cookie_hdr, set_cookies)

        # Prefer AppCookie presence as success signal
        has_app = "AppCookie=" in cookie
        body: Any = None
        try:
            if response.content:
                body = response.json()
        except ValueError:
            body = None

        user_name = ""
        if isinstance(body, dict):
            user_name = (
                body.get("fullName")
                or body.get("name")
                or body.get("displayName")
                or ""
            )
            # nested result patterns
            result = body.get("result") if isinstance(body.get("result"), dict) else {}
            if not user_name and result:
                user_name = result.get("fullName") or result.get("name") or ""

        if response.ok and (has_app or cookie):
            return {
                "ok": True,
                "cookie": cookie,
                "user_name": user_name,
                "http_status": response.status_code,
                "has_app_cookie": has_app,
            }

        # Sometimes login returns 200 with body but Set-Cookie only via jar
        if response.ok and (response.cookies or session.cookies):
            jar_parts = [f"{c.name}={c.value}" for c in response.cookies]
            jar_parts += [f"{c.name}={c.value}" for c in session.cookies]
            cookie = cls._merge_cookies(cookie, jar_parts)
            if "AppCookie=" in cookie or cookie:
                return {
                    "ok": True,
                    "cookie": cookie,
                    "user_name": user_name,
                    "http_status": response.status_code,
                    "has_app_cookie": "AppCookie=" in cookie,
                }

        err = f"login נכשל ({response.status_code})"
        if response.status_code == 404:
            body_empty = not (response.content or b"").strip()
            if body_empty:
                err = (
                    "login נכשל (404): תגובה ריקה — ייתכן חסימת WAF/Incapsula "
                    "(חסרות cookies) או endpoint לא נמצא. ה-SPA משתמש ב-GET."
                )
            else:
                err = (
                    "login נכשל (404): ייתכן method שגוי או נתיב לא תקין "
                    "(ה-SPA קורא GET /api/account/login)."
                )
        if isinstance(body, dict):
            err = body.get("error") or body.get("message") or body.get("statusDescription") or err
        return {
            "ok": False,
            "error": err,
            "http_status": response.status_code,
            "cookie": cookie if cookie else "",
        }
