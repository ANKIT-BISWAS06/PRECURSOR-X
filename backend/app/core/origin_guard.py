"""
Origin guard for state-changing requests (CSRF defence in depth).

Architecture: Browser -> same-origin Express server -> FastAPI. Session cookies are
HttpOnly + SameSite=Lax, so browsers do not attach them to cross-site POST/PUT/PATCH/DELETE
requests. This guard adds a second layer: if a state-changing request carries an Origin
header (browsers always send one on such requests) it must be an origin we trust, the same
set that CORS allows. Requests without an Origin header (curl, server-to-server, tests) are
not affected; they cannot be driven cross-site by a victim's browser.
"""

import re
from typing import Iterable, Optional

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})


class OriginGuardMiddleware:
    def __init__(self, app: ASGIApp, allowed_origins: Iterable[str], allow_origin_regex: Optional[str] = None) -> None:
        self.app = app
        self.allowed = {o.strip().rstrip("/") for o in allowed_origins if o and o.strip()}
        self.regex = re.compile(allow_origin_regex) if allow_origin_regex else None

    def _is_allowed(self, origin: str) -> bool:
        normalized = origin.strip().rstrip("/")
        if normalized in self.allowed:
            return True
        return bool(self.regex and self.regex.fullmatch(normalized))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] in UNSAFE_METHODS:
            origin = None
            for name, value in scope.get("headers", []):
                if name == b"origin":
                    origin = value.decode("latin-1")
                    break
            if origin is not None and not self._is_allowed(origin):
                response = JSONResponse(
                    status_code=403,
                    content={"detail": "Cross-origin state-changing requests are not allowed from this origin."},
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
