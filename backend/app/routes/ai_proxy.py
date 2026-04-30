from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from app.services.ai_service import rule_based_reply, call_claude
from app.middleware.auth import get_current_user
from app.middleware.rate_limit import user_rate_limit
from app.config import settings
import httpx

router = APIRouter(
    tags=["ai"],
    dependencies=[
        Depends(get_current_user),
        Depends(user_rate_limit(settings.rate_limit_live_api, "live")),
    ],
)

_ai_key: str | None = None


class AIRequest(BaseModel):
    model: str = "claude-sonnet-4-6"
    max_tokens: int = 1024
    system: str = ""
    messages: list[dict] = []


class KeyRequest(BaseModel):
    key: str


@router.get("/status")
async def ai_status():
    return {"key_loaded": bool(_ai_key), "mode": "claude" if _ai_key else "rule-based"}


@router.post("/key")
async def set_ai_key(body: KeyRequest, request: Request):
    client_ip = request.client.host if request.client else ""
    if client_ip not in ("127.0.0.1", "::1"):
        raise HTTPException(403, "Forbidden — local access only")
    key = body.key.strip()
    if not key.startswith("sk-ant-"):
        raise HTTPException(400, "Invalid key format. Must start with sk-ant-")
    global _ai_key
    _ai_key = key
    return {"ok": True, "message": "API key saved for this session."}


@router.post("")
async def ai_proxy(body: AIRequest):
    payload = body.model_dump()

    if _ai_key:
        try:
            result = await call_claude(_ai_key, payload)
            return result
        except httpx.HTTPStatusError as e:
            if e.response.status_code in (401, 403):
                global _ai_key
                _ai_key = None
            raise HTTPException(502, f"Anthropic API error {e.response.status_code}")
        except Exception as e:
            raise HTTPException(502, f"Claude API call failed: {str(e)}")

    reply_text = rule_based_reply(payload)
    return {
        "id":    "rb-0000",
        "type":  "message",
        "role":  "assistant",
        "model": "rule-based-v1",
        "content": [{"type": "text", "text": reply_text}],
        "stop_reason": "end_turn",
        "_mode": "rule-based",
        "_use_js_engine": True,
    }
