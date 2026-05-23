# services/llm.py
"""
LLM abstraction backed by LiteLLM.

Config is read from SQLite (via db.get_config()) on every call so that
settings changes in the UI take effect immediately without a restart.
Falls back to environment variables for backwards-compatibility with
docker-compose deployments that set LLM_API_KEY / LLM_MODEL directly.
"""
import logging
import os
from typing import Generator, List, Optional

import litellm

import db

# Silence LiteLLM's default verbose output
litellm.suppress_debug_info = True
logging.getLogger("LiteLLM").setLevel(logging.ERROR)
logging.getLogger("httpx").setLevel(logging.WARNING)

LLM_TIMEOUT = int(os.getenv("LLM_TIMEOUT_SECONDS", "30"))

# Providers that don't require an API key (local / self-hosted)
_NO_KEY_PROVIDERS = {"ollama"}


class LLMError(RuntimeError):
    """Raised when the LLM provider returns an error or is unreachable."""


class LLMNotConfiguredError(LLMError):
    """Raised when no LLM has been configured (no SQLite row and no env vars)."""


def _build_model_string(provider: str, model: str) -> str:
    """
    Construct the litellm model identifier.

    LiteLLM uses prefixed strings for non-OpenAI providers:
      openai    → "gpt-4o-mini"
      anthropic → "anthropic/claude-3-5-sonnet-20241022"
      groq      → "groq/llama-3.1-8b-instant"
      ollama    → "ollama/llama3"
    """
    p = provider.lower()
    if p == "openai":
        return model
    # Avoid double-prefixing if the user already included the provider
    if model.startswith(f"{p}/"):
        return model
    return f"{p}/{model}"


def _resolve_config() -> Optional[dict]:
    """
    Return a config dict with keys: provider, api_key, model, base_url.
    Priority: SQLite config → environment variables → None (not configured).
    """
    cfg = db.get_config()
    provider = (cfg or {}).get("provider", "").lower()
    api_key = (cfg or {}).get("api_key", "")

    # SQLite config is valid when an api_key exists, OR for key-free providers
    if cfg is not None and (api_key or provider in _NO_KEY_PROVIDERS):
        return cfg

    # Env-var fallback (backwards compatibility)
    env_key = os.getenv("LLM_API_KEY", "")
    env_provider = os.getenv("LLM_PROVIDER", "openai")
    if env_key or env_provider in _NO_KEY_PROVIDERS:
        return {
            "provider": env_provider,
            "api_key": env_key,
            "model": os.getenv("LLM_MODEL", "gpt-4o-mini"),
            "base_url": os.getenv("LLM_BASE_URL", ""),
        }

    return None


def call_llm(
    prompt: str,
    system: str = "You are a helpful genomics assistant.",
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 512,
    history: Optional[List[dict]] = None,
) -> str:
    cfg = _resolve_config()
    if cfg is None:
        raise LLMNotConfiguredError(
            "No LLM configured. Open Settings and enter your API key and model."
        )

    provider = cfg.get("provider", "openai")
    api_key = cfg.get("api_key", "") or None
    configured_model = cfg.get("model", "gpt-4o-mini")
    base_url = cfg.get("base_url", "") or None

    litellm_model = _build_model_string(provider, model or configured_model)

    messages: List[dict] = [{"role": "system", "content": system}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": prompt})

    kwargs: dict = {
        "model": litellm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "timeout": LLM_TIMEOUT,
    }
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["base_url"] = base_url

    try:
        response = litellm.completion(**kwargs)
    except Exception as exc:
        raise LLMError(f"LLM call failed ({litellm_model}): {exc}") from exc

    return response.choices[0].message.content.strip()


def call_llm_stream(
    prompt: str,
    system: str = "You are a helpful genomics assistant.",
    model: Optional[str] = None,
    temperature: float = 0.3,
    max_tokens: int = 512,
    history: Optional[List[dict]] = None,
) -> Generator[str, None, None]:
    """
    Streaming variant of call_llm.  Yields text delta strings as they arrive
    from the LLM provider.  Raises LLMError / LLMNotConfiguredError on failure.
    """
    cfg = _resolve_config()
    if cfg is None:
        raise LLMNotConfiguredError(
            "No LLM configured. Open Settings and enter your API key and model."
        )

    provider = cfg.get("provider", "openai")
    api_key = cfg.get("api_key", "") or None
    configured_model = cfg.get("model", "gpt-4o-mini")
    base_url = cfg.get("base_url", "") or None

    litellm_model = _build_model_string(provider, model or configured_model)

    messages: List[dict] = [{"role": "system", "content": system}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": prompt})

    kwargs: dict = {
        "model": litellm_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "timeout": LLM_TIMEOUT,
        "stream": True,
    }
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["base_url"] = base_url

    try:
        response = litellm.completion(**kwargs)
        for chunk in response:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
    except Exception as exc:
        raise LLMError(f"LLM streaming call failed ({litellm_model}): {exc}") from exc
