"""
Microsoft PKCE for one.prat.idf.il — same paste-URL pattern as HOGER (home.idf / zuzu).

1) Build auth URL (response_mode=fragment → #code= in address bar)
2) Soldier pastes https://one.prat.idf.il/#code=…
3) Exchange code + code_verifier → id_token / access_token
4) Caller sends JWT to PratAuthService.login_with_ms_token
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import secrets
import uuid
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlencode

import requests


class MsOAuthService:
    TENANT_ID = "78820852-55fa-450b-908d-45c0d911e76b"
    # one.prat MSAL SPA client (from live Network / login.microsoftonline.com)
    CLIENT_ID = "f39dfb4b-6a50-42a5-98aa-829fc7414a10"
    REDIRECT_URI = "https://one.prat.idf.il"
    SCOPE = "User.Read openid profile offline_access"
    REDIRECT_MARKERS = [
        "https://one.prat.idf.il/",
        "https://one.prat.idf.il",
    ]

    @classmethod
    def authorization_endpoint(cls) -> str:
        return (
            f"https://login.microsoftonline.com/{cls.TENANT_ID}/oauth2/v2.0/authorize"
        )

    @classmethod
    def token_endpoint(cls) -> str:
        return f"https://login.microsoftonline.com/{cls.TENANT_ID}/oauth2/v2.0/token"

    @staticmethod
    def generate_verifier() -> str:
        raw = secrets.token_urlsafe(32)
        return raw.replace("+", "-").replace("/", "_").replace("=", "")

    @staticmethod
    def challenge_from_verifier(verifier: str) -> str:
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

    @classmethod
    def build_auth_url(cls, id_number: str, code_verifier: str) -> Dict[str, str]:
        digits = re.sub(r"\D", "", id_number or "")
        if len(digits) < 5 or len(digits) > 16:
            raise ValueError("invalid_id_number")
        upn = f"{digits}@idf.il"
        challenge = cls.challenge_from_verifier(code_verifier)
        state = base64.b64encode(
            json.dumps({"id": str(uuid.uuid4()), "meta": {"interactionType": "redirect"}}).encode()
        ).decode()
        params = {
            "client_id": cls.CLIENT_ID,
            "scope": cls.SCOPE,
            "redirect_uri": cls.REDIRECT_URI,
            "response_mode": "fragment",
            "response_type": "code",
            "login_hint": upn,
            "X-AnchorMailbox": f"UPN:{upn}",
            "nonce": str(uuid.uuid4()),
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": state,
            "prompt": "select_account",
        }
        return {
            "authUrl": f"{cls.authorization_endpoint()}?{urlencode(params)}",
            "codeVerifier": code_verifier,
            "redirectUri": cls.REDIRECT_URI,
            "clientId": cls.CLIENT_ID,
        }

    @classmethod
    def parse_redirect_url(cls, raw: str) -> Dict[str, str]:
        normalized = re.sub(r"\s+", "", (raw or "").strip())
        if not normalized:
            raise ValueError("authorization_url_missing")

        lower = normalized.lower()
        url = None
        for marker in cls.REDIRECT_MARKERS:
            idx = lower.find(marker.lower())
            if idx != -1:
                url = normalized[idx:]
                break
        if not url:
            # allow bare #code=... paste
            if "code=" in normalized:
                url = cls.REDIRECT_URI + "/#" + normalized.lstrip("#")
            else:
                raise ValueError("authorization_url_missing")

        hash_idx = url.find("#")
        query_idx = url.find("?")
        if hash_idx != -1:
            params_text = url[hash_idx + 1:]
        elif query_idx != -1:
            params_text = url[query_idx + 1:]
        else:
            raise ValueError("authorization_params_missing")

        err = cls._param(params_text, "error")
        if err:
            desc = cls._param(params_text, "error_description") or ""
            raise ValueError(f"{err}:{desc}")

        code = cls._extract_code(params_text)
        if not code:
            raise ValueError("authorization_code_missing")

        return {
            "code": code,
            "state": cls._param(params_text, "state") or "",
            "redirectUri": cls.REDIRECT_URI,
        }

    @staticmethod
    def _param(params_text: str, name: str) -> Optional[str]:
        prefix = f"{name}="
        idx = params_text.find(prefix)
        if idx == -1:
            return None
        start = idx + len(prefix)
        end = params_text.find("&", start)
        raw = params_text[start:] if end == -1 else params_text[start:end]
        try:
            from urllib.parse import unquote
            return unquote(raw)
        except Exception:
            return raw

    @staticmethod
    def _extract_code(params_text: str) -> Optional[str]:
        prefix = "code="
        idx = params_text.find(prefix)
        if idx == -1:
            return None
        start = idx + len(prefix)
        boundaries = ["&client_info=", "&state=", "&session_state=", "&error=", "&error_description="]
        end = len(params_text)
        for boundary in boundaries:
            pos = params_text.find(boundary, start)
            if pos != -1 and pos < end:
                end = pos
        code = params_text[start:end]
        return code if len(code) >= 8 else None

    @classmethod
    def exchange_code(cls, code: str, code_verifier: str) -> Dict[str, Any]:
        data = {
            "client_id": cls.CLIENT_ID,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": cls.REDIRECT_URI,
            "code_verifier": code_verifier,
            "scope": cls.SCOPE,
        }
        response = requests.post(
            cls.token_endpoint(),
            data=data,
            headers={
                "content-type": "application/x-www-form-urlencoded",
                "origin": "https://one.prat.idf.il",
                "referer": "https://one.prat.idf.il/",
            },
            timeout=30,
        )
        body = {}
        try:
            body = response.json()
        except ValueError:
            body = {"error": "invalid_json", "raw": (response.text or "")[:200]}
        if not response.ok:
            err = body.get("error_description") or body.get("error") or f"token_exchange_{response.status_code}"
            raise ValueError(str(err))
        if not body.get("id_token") and not body.get("access_token"):
            raise ValueError("token_exchange:no_tokens")
        return body

    @classmethod
    def jwt_for_prat_login(cls, tokens: Dict[str, Any]) -> str:
        # Live one.prat account/login used the JWT from authorization header;
        # id_token matches the sample (name, preferred_username). Prefer id_token.
        return (tokens.get("id_token") or tokens.get("access_token") or "").strip()
