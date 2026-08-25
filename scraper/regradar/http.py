"""Defensiver HTTP-Client: Rate-Limit pro Host, Conditional GET,
Timeouts, Retry mit Backoff, fester User-Agent."""
import hashlib
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, Optional, Tuple

from . import USER_AGENT

MIN_DELAY_PER_HOST = 1.5      # Sekunden zwischen Requests an denselben Host
TIMEOUT = 30
RETRIES = 3

_last_request_at: Dict[str, float] = {}


class FetchResult:
    def __init__(self, url: str, status: int, content: bytes, headers: dict):
        self.url = url
        self.status = status
        self.content = content
        self.headers = {k.lower(): v for k, v in headers.items()}

    @property
    def content_type(self) -> str:
        return self.headers.get("content-type", "")

    @property
    def etag(self) -> Optional[str]:
        return self.headers.get("etag")

    @property
    def last_modified(self) -> Optional[str]:
        return self.headers.get("last-modified")

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.content).hexdigest()

    def text(self, fallback: str = "utf-8") -> str:
        ct = self.content_type
        enc = fallback
        if "charset=" in ct:
            enc = ct.split("charset=")[-1].split(";")[0].strip()
        try:
            return self.content.decode(enc, errors="replace")
        except LookupError:
            return self.content.decode("utf-8", errors="replace")


def _throttle(url: str) -> None:
    host = urllib.parse.urlparse(url).netloc
    last = _last_request_at.get(host, 0.0)
    wait = MIN_DELAY_PER_HOST - (time.time() - last)
    if wait > 0:
        time.sleep(wait)
    _last_request_at[host] = time.time()


def get(url: str, etag: Optional[str] = None, last_modified: Optional[str] = None,
        extra_headers: Optional[dict] = None) -> Tuple[Optional[FetchResult], Optional[str]]:
    """GET mit Conditional-Headern. Rückgabe (result, error).
    Bei HTTP 304 ist result.status == 304 und content leer."""
    headers = {"User-Agent": USER_AGENT, "Accept": "*/*"}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified
    if extra_headers:
        headers.update(extra_headers)

    last_err = None
    for attempt in range(RETRIES):
        _throttle(url)
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return FetchResult(url, resp.status, resp.read(), dict(resp.headers)), None
        except urllib.error.HTTPError as e:
            if e.code == 304:
                return FetchResult(url, 304, b"", dict(e.headers)), None
            last_err = "HTTP {} für {}".format(e.code, url)
            if e.code in (429, 500, 502, 503, 504) and attempt < RETRIES - 1:
                time.sleep(2 ** attempt * 2)
                continue
            return None, last_err
        except Exception as e:  # URLError, Timeout …
            last_err = "{}: {}".format(type(e).__name__, e)
            if attempt < RETRIES - 1:
                time.sleep(2 ** attempt * 2)
    return None, last_err
