"""
Shared HTTP helpers. urllib only — matches the dependency footprint of
services/ingestion.py (no `requests` import added to the project).
"""
import json
import time
import urllib.error
import urllib.request
from typing import Any, Optional


def http_post_json(url: str, payload: dict, timeout: float = 20.0) -> Optional[dict]:
    """POST a JSON body and return the decoded JSON response, or None on any error."""
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return None


def http_get_json(url: str, timeout: float = 20.0) -> Optional[Any]:
    """GET a JSON resource and return the decoded body, or None on any error."""
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return None


def polite_sleep(seconds: float = 1.0) -> None:
    """Rate-limit sleep — kept as a separate helper so tests can monkeypatch it."""
    time.sleep(seconds)
