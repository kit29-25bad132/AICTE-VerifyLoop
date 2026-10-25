"""FastAPI bridge around the existing Python llm-orchestrator package."""

from __future__ import annotations

import os
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from llm_orchestrator.config import (
    OrchestratorSettings,
    build_registry,
    load_settings,
)
from llm_orchestrator.contracts import (
    LLMRequest,
    Message,
    MessageRole,
    ModelConfig,
    ProviderConfig,
)
from llm_orchestrator.reliability import FallbackExecutor, RetryEngine
from llm_orchestrator.routing import ModelRouter, StaticRoutingPolicy

app = FastAPI(title="LLM Orchestrator Bridge", version="1.0.0")


class ExtractRequest(BaseModel):
    system_prompt: str = Field(min_length=1)
    user_prompt: str = Field(min_length=1)
    output_schema: dict[str, Any]


class ExtractResponse(BaseModel):
    data: dict[str, Any]
    provider: str
    model: str


def _build_runtime() -> tuple[Any, Any, Any, tuple[ModelConfig, ...]]:
    candidates = (
        ModelConfig(provider="gemini", model=os.getenv("GEMINI_MODEL", "gemini-1.5-flash")),
        ModelConfig(provider="groq", model=os.getenv("GROQ_MODEL", "llama3-8b-8192")),
    )
    settings = load_settings(
        explicit=OrchestratorSettings(
            providers=(
                ProviderConfig(name="gemini", credential_env_var="GEMINI_API_KEY"),
                ProviderConfig(name="groq", credential_env_var="GROQ_API_KEY"),
            ),
            models=candidates,
        ),
        env=os.environ,
    )
    registry = build_registry(settings, env=os.environ)
    retry_engine = RetryEngine(settings.retry)
    router = ModelRouter(StaticRoutingPolicy(preferred_provider="gemini"))
    executor = FallbackExecutor(registry=registry, retry_engine=retry_engine, policy=settings.fallback)
    return registry, router, executor, candidates


registry, router, executor, candidates = _build_runtime()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/extract", response_model=ExtractResponse)
async def extract(req: ExtractRequest) -> ExtractResponse:
    llm_req = LLMRequest(
        messages=(
            Message(role=MessageRole.SYSTEM, content=req.system_prompt),
            Message(
                role=MessageRole.USER,
                content=f"{req.user_prompt}\nReturn JSON matching this schema:\n{req.output_schema}",
            ),
        ),
    )
    selected = router.select(llm_req, candidates)
    try:
        result = await executor.run(llm_req, candidates, initial=selected)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="orchestrator execution failed") from exc
    if not result.succeeded or result.response is None:
        raise HTTPException(status_code=502, detail="all configured providers failed")
    content = result.response.content or ""
    return ExtractResponse(
        data={"raw": content},
        provider=result.response.provider,
        model=result.response.model,
    )
