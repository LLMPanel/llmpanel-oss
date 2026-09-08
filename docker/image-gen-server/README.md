# LLMPanel Image-Generation Server

A small OpenAI-compatible **text-to-image** server backed by 🤗 diffusers. This is
the image-model equivalent of the vLLM container LLMPanel uses for LLMs: LLMPanel
launches it on a GPU host and proxies inference requests to it.

A single image serves **any** diffusers checkpoint — the model is selected at
runtime via the `MODEL_ID` env var.

## Build & push

```bash
# from this directory
docker build -t llmpanel/image-gen-server:latest .
docker push llmpanel/image-gen-server:latest   # push to your registry
```

The catalog entry (`apps/api/src/services/image-models.catalog.ts`) points each
image model at this image via its `dockerImage` field. If you publish under a
different name/tag, update the catalog (or set the model's `dockerImage`).

## Run locally

```bash
docker run --rm --gpus all -p 8000:8000 \
  -e MODEL_ID=Tongyi-MAI/Z-Image-Turbo \
  -e HF_TOKEN=hf_xxx \
  llmpanel/image-gen-server:latest
```

## API

```bash
curl http://localhost:8000/v1/images/generations \
  -H 'Content-Type: application/json' \
  -d '{
    "prompt": "a red panda astronaut, studio lighting",
    "negative_prompt": "blurry, low quality",
    "width": 1024, "height": 1024,
    "num_inference_steps": 8, "guidance_scale": 3.5,
    "n": 1, "seed": 42
  }'
```

Response (OpenAI shape):

```json
{ "created": 1719600000, "model": "Tongyi-MAI/Z-Image-Turbo",
  "data": [{ "b64_json": "iVBORw0KG..." }] }
```

`GET /health` reports `{ "model_loaded": true }` once weights are in VRAM — the
LLMPanel deployment tracker waits for this before marking the deployment running.

## Env vars

| Var        | Default                      | Purpose                         |
|------------|------------------------------|---------------------------------|
| `MODEL_ID` | `Tongyi-MAI/Z-Image-Turbo`   | HF repo id of the model to load |
| `HF_TOKEN` | —                            | HF token for gated models       |
