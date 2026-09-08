"""
LLMPanel image-generation server.

A tiny OpenAI-compatible text-to-image server backed by 🤗 diffusers. The model
is chosen entirely via the MODEL_ID environment variable, so a single container
image can serve any diffusers-compatible checkpoint (Z-Image-Turbo, FLUX, SDXL…).

Endpoints (served on :8000 to match the rest of LLMPanel):
  GET  /health                  -> {"status": "ok", "model_loaded": bool}
  GET  /v1/models               -> OpenAI-style model list
  POST /v1/images/generations   -> {"created", "data": [{"b64_json"}]}

The LLMPanel gateway proxies to this server, persists the returned base64
images to disk and rewrites them into public URLs — so this process only ever
deals with base64 and never touches storage.
"""

import base64
import io
import os
import time
from typing import List, Optional

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get("MODEL_ID", "Tongyi-MAI/Z-Image-Turbo")
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")

app = FastAPI(title="LLMPanel Image Server")

# Lazily-loaded global pipeline. Loading happens on startup so the deployment
# health check only flips to "ready" once weights are in VRAM.
_pipe = None
_load_error: Optional[str] = None


def _dtype() -> torch.dtype:
    if torch.cuda.is_available():
        return torch.float16
    return torch.float32


def load_pipeline():
    """Load the diffusers pipeline for MODEL_ID onto the GPU (or CPU fallback)."""
    global _pipe, _load_error
    try:
        from diffusers import AutoPipelineForText2Image

        pipe = AutoPipelineForText2Image.from_pretrained(
            MODEL_ID,
            torch_dtype=_dtype(),
            token=HF_TOKEN,
            trust_remote_code=True,
        )
        if torch.cuda.is_available():
            pipe = pipe.to("cuda")
        else:
            # CPU is only useful for plumbing/smoke tests — generations are slow.
            pipe = pipe.to("cpu")

        # Memory-saving helpers; harmless if the pipeline doesn't support them.
        for fn in ("enable_attention_slicing", "enable_vae_tiling"):
            try:
                getattr(pipe, fn)()
            except Exception:
                pass

        _pipe = pipe
        _load_error = None
        print(f"[image-server] Loaded {MODEL_ID} on {pipe.device}", flush=True)
    except Exception as exc:  # noqa: BLE001 — surface any load failure via /health
        _load_error = str(exc)
        print(f"[image-server] Failed to load {MODEL_ID}: {exc}", flush=True)


@app.on_event("startup")
def _startup():
    print(f"[image-server] Starting up, loading model {MODEL_ID}...", flush=True)
    load_pipeline()
    # Uvicorn prints "Application startup complete." after this returns, which is
    # exactly what the LLMPanel deployment tracker waits for.


@app.get("/health")
def health():
    return {
        "status": "ok" if _pipe is not None else "loading",
        "model": MODEL_ID,
        "model_loaded": _pipe is not None,
        "error": _load_error,
    }


@app.get("/v1/models")
def list_models():
    return {
        "object": "list",
        "data": [{"id": MODEL_ID, "object": "model", "owned_by": "llmpanel"}],
    }


class ImageRequest(BaseModel):
    # Accept both OpenAI-style and diffusers-style field names.
    prompt: str
    negative_prompt: Optional[str] = None
    n: int = Field(default=1, ge=1, le=4)
    width: int = Field(default=1024, ge=128, le=2048)
    height: int = Field(default=1024, ge=128, le=2048)
    num_inference_steps: int = Field(default=8, ge=1, le=100)
    guidance_scale: float = Field(default=3.5, ge=0.0, le=20.0)
    seed: Optional[int] = None
    # OpenAI compatibility aliases (ignored values are tolerated)
    size: Optional[str] = None  # e.g. "1024x1024"


def _apply_size(req: ImageRequest):
    if req.size and "x" in req.size:
        try:
            w, h = req.size.lower().split("x")
            req.width, req.height = int(w), int(h)
        except ValueError:
            pass


@app.post("/v1/images/generations")
def generate(req: ImageRequest):
    if _pipe is None:
        raise HTTPException(
            status_code=503,
            detail=f"Model not loaded yet{f': {_load_error}' if _load_error else ''}",
        )

    _apply_size(req)

    generator = None
    if req.seed is not None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        generator = torch.Generator(device=device).manual_seed(int(req.seed))

    try:
        result = _pipe(
            prompt=req.prompt,
            negative_prompt=req.negative_prompt,
            width=req.width,
            height=req.height,
            num_inference_steps=req.num_inference_steps,
            guidance_scale=req.guidance_scale,
            num_images_per_prompt=req.n,
            generator=generator,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Generation failed: {exc}")

    data: List[dict] = []
    for image in result.images:
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        data.append({"b64_json": b64})

    return {
        "created": int(time.time()),
        "model": MODEL_ID,
        "data": data,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
