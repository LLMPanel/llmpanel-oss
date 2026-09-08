export type HttpMethod = "GET" | "POST" | "DELETE"
export type EndpointCategory = "Chat" | "Completions" | "Embeddings" | "Images" | "Models" | "vLLM" | "Server"

export interface Parameter {
  name: string
  type: string
  required: boolean
  description: string
  example?: string
}

export interface SnippetOpts {
  /** Direct inference-server base URL (vLLM / image server container). */
  base: string
  key: string
  model: string
  /** LLMPanel API origin — gateway endpoints (auth, logging, image hosting) live here. */
  gatewayBase: string
  deploymentId: string
  /** The deployment's own routable origin (https://<domain>) when wildcard DNS is configured, else null. */
  domainBase: string | null
}

/**
 * Deployment-scoped OpenAI-style base URL. On the deployment's own subdomain
 * the API accepts the exact OpenAI paths (`/v1/chat/completions`), so SDK
 * snippets can use this verbatim as `base_url`. Without a routable domain it
 * falls back to the gateway's path-scoped form.
 */
export function scopedBase({ domainBase, gatewayBase, deploymentId }: SnippetOpts): string {
  return domainBase ? `${domainBase}/v1` : `${gatewayBase}/v1/deployments/${deploymentId}`
}

/** Workspace-level /v1 root (models list, key-bound endpoints). */
function apiV1({ domainBase, gatewayBase }: SnippetOpts): string {
  return `${domainBase ?? gatewayBase}/v1`
}

export interface Endpoint {
  id: string
  method: HttpMethod
  path: string
  /** Clean OpenAI-style path served on the deployment's own subdomain (e.g. "/v1/chat/completions"). */
  subdomainPath?: string
  title: string
  description: string
  category: EndpointCategory
  /** True when the endpoint is served by the LLMPanel gateway rather than the inference container. */
  gateway?: boolean
  params?: Parameter[]
  curl: (opts: SnippetOpts) => string
  python?: (opts: SnippetOpts) => string
  javascript?: (opts: SnippetOpts) => string
  responseExample: string
}

export const ENDPOINTS: Endpoint[] = [
  // ── Chat ──────────────────────────────────────────────────────────────────

  {
    id: "chat-completions",
    method: "POST",
    path: "/v1/deployments/{deploymentId}/chat/completions",
    subdomainPath: "/v1/chat/completions",
    title: "Chat Completions",
    description:
      "Generate a model response for a multi-turn conversation. Fully compatible with the OpenAI Chat Completions API. Supports both streaming (SSE) and non-streaming responses. Served by the LLMPanel gateway: requests are authenticated with your API key, logged to Analytics, and rate-limited per key.",
    category: "Chat",
    gateway: true,
    params: [
      {
        name: "model",
        type: "string",
        required: true,
        description: "The model slug to use for the request.",
        example: '"llama-3.1-8b"',
      },
      {
        name: "messages",
        type: "array",
        required: true,
        description:
          "A list of messages describing the conversation. Each message has a `role` (system | user | assistant) and `content`.",
        example: '[{"role":"user","content":"Hello!"}]',
      },
      {
        name: "stream",
        type: "boolean",
        required: false,
        description: "If true, returns a server-sent event stream. Tokens are sent as `data: {...}` chunks ending with `data: [DONE]`.",
        example: "false",
      },
      {
        name: "max_tokens",
        type: "integer",
        required: false,
        description: "Maximum number of tokens to generate. Defaults to the model's context window limit.",
        example: "512",
      },
      {
        name: "temperature",
        type: "number",
        required: false,
        description: "Sampling temperature between 0 and 2. Higher values make output more random; lower values more deterministic.",
        example: "0.7",
      },
      {
        name: "top_p",
        type: "number",
        required: false,
        description: "Nucleus sampling: consider tokens comprising the top P probability mass. Between 0 and 1.",
        example: "0.9",
      },
      {
        name: "frequency_penalty",
        type: "number",
        required: false,
        description: "Penalise tokens based on their frequency so far. Between -2.0 and 2.0.",
        example: "0",
      },
      {
        name: "stop",
        type: "string | array",
        required: false,
        description: "Up to 4 sequences where the API will stop generating further tokens.",
        example: '"\\n"',
      },
      {
        name: "n",
        type: "integer",
        required: false,
        description: "How many chat completion choices to generate for each input message.",
        example: "1",
      },
    ],
    curl: (opts) =>
      `curl ${scopedBase(opts)}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${opts.key}" \\
  -d '{
    "model": "${opts.model}",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello! What can you do?"}
    ],
    "max_tokens": 512,
    "temperature": 0.7
  }'`,
    python: (opts) =>
      `from openai import OpenAI

client = OpenAI(
    base_url="${scopedBase(opts)}",
    api_key="${opts.key}",
)

response = client.chat.completions.create(
    model="${opts.model}",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello! What can you do?"},
    ],
    max_tokens=512,
)
print(response.choices[0].message.content)`,
    javascript: (opts) =>
      `import OpenAI from "openai"

const client = new OpenAI({
  baseURL: "${scopedBase(opts)}",
  apiKey: "${opts.key}",
})

const response = await client.chat.completions.create({
  model: "${opts.model}",
  messages: [{ role: "user", content: "Hello! What can you do?" }],
  max_tokens: 512,
})
console.log(response.choices[0].message.content)`,
    responseExample: `{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1710000000,
  "model": "llama-3.1-8b",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! I can help you with a wide range of tasks..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 24,
    "completion_tokens": 48,
    "total_tokens": 72
  }
}`,
  },

  {
    id: "chat-completions-stream",
    method: "POST",
    path: "/v1/deployments/{deploymentId}/chat/completions",
    subdomainPath: "/v1/chat/completions",
    title: "Chat Completions (Streaming)",
    description:
      "Same as Chat Completions but with `stream: true`. Returns a server-sent event (SSE) stream. Each chunk contains a partial delta; the stream ends with `data: [DONE]`. Streamed requests are logged too — the gateway reassembles the stream in the background.",
    category: "Chat",
    gateway: true,
    params: [
      {
        name: "model",
        type: "string",
        required: true,
        description: "The model slug to use.",
        example: '"llama-3.1-8b"',
      },
      {
        name: "messages",
        type: "array",
        required: true,
        description: "Conversation history.",
        example: '[{"role":"user","content":"Tell me a joke"}]',
      },
      {
        name: "stream",
        type: "boolean",
        required: true,
        description: "Must be `true` to enable streaming.",
        example: "true",
      },
      {
        name: "stream_options",
        type: "object",
        required: false,
        description: 'Set `{"include_usage": true}` to receive token usage in the final stream chunk.',
        example: '{"include_usage": true}',
      },
    ],
    curl: (opts) =>
      `curl ${scopedBase(opts)}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${opts.key}" \\
  --no-buffer \\
  -d '{
    "model": "${opts.model}",
    "messages": [{"role": "user", "content": "Tell me a joke"}],
    "stream": true,
    "stream_options": {"include_usage": true}
  }'`,
    responseExample: `data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"delta":{"role":"assistant"},"index":0}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"delta":{"content":"Why"},"index":0}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"delta":{"content":" did"},"index":0}]}

data: {"id":"chatcmpl-abc","object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop","index":0}],"usage":{"prompt_tokens":12,"completion_tokens":20,"total_tokens":32}}

data: [DONE]`,
  },

  // ── Completions ────────────────────────────────────────────────────────────

  {
    id: "completions",
    method: "POST",
    path: "/v1/deployments/{deploymentId}/completions",
    subdomainPath: "/v1/completions",
    title: "Text Completions",
    description:
      "Generate text completions for a given prompt. Useful for legacy workflows or when you want direct control over the prompt format without a chat wrapper. Served by the LLMPanel gateway with API-key auth and request logging.",
    category: "Completions",
    gateway: true,
    params: [
      { name: "model", type: "string", required: true, description: "Model slug.", example: '"llama-3.1-8b"' },
      { name: "prompt", type: "string", required: true, description: "The prompt to complete.", example: '"Once upon a time"' },
      { name: "max_tokens", type: "integer", required: false, description: "Max tokens to generate.", example: "256" },
      { name: "temperature", type: "number", required: false, description: "Sampling temperature.", example: "1.0" },
      { name: "stream", type: "boolean", required: false, description: "Stream tokens via SSE.", example: "false" },
      { name: "echo", type: "boolean", required: false, description: "Echo the prompt in the response.", example: "false" },
      { name: "logprobs", type: "integer", required: false, description: "Include log probabilities for the top N tokens.", example: "null" },
    ],
    curl: (opts) =>
      `curl ${scopedBase(opts)}/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${opts.key}" \\
  -d '{
    "model": "${opts.model}",
    "prompt": "Once upon a time",
    "max_tokens": 256,
    "temperature": 1.0
  }'`,
    responseExample: `{
  "id": "cmpl-xyz789",
  "object": "text_completion",
  "created": 1710000000,
  "model": "llama-3.1-8b",
  "choices": [
    {
      "text": ", in a land far away, there lived a wise old wizard...",
      "index": 0,
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 5, "completion_tokens": 20, "total_tokens": 25 }
}`,
  },

  // ── Embeddings ─────────────────────────────────────────────────────────────

  {
    id: "embeddings",
    method: "POST",
    path: "/v1/deployments/{deploymentId}/embeddings",
    subdomainPath: "/v1/embeddings",
    title: "Embeddings",
    description:
      "Generate vector embeddings for one or more input strings. Use embeddings for semantic search, clustering, classification, and RAG pipelines. Requires a model that supports embedding generation. Served by the LLMPanel gateway with API-key auth and request logging.",
    category: "Embeddings",
    gateway: true,
    params: [
      { name: "model", type: "string", required: true, description: "Embedding model slug.", example: '"llama-3.1-8b"' },
      { name: "input", type: "string | array", required: true, description: "Input text(s) to embed. Can be a single string or array of strings.", example: '"LLMPanel is awesome"' },
      { name: "encoding_format", type: "string", required: false, description: "`float` or `base64`. Defaults to `float`.", example: '"float"' },
      { name: "dimensions", type: "integer", required: false, description: "Reduce embedding dimensions (only for models that support Matryoshka).", example: "null" },
    ],
    curl: (opts) =>
      `curl ${scopedBase(opts)}/embeddings \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${opts.key}" \\
  -d '{
    "model": "${opts.model}",
    "input": ["LLMPanel makes LLM deployment easy", "Another sentence to embed"]
  }'`,
    responseExample: `{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0023, -0.009, 0.015, ...]
    },
    {
      "object": "embedding",
      "index": 1,
      "embedding": [0.0018, -0.011, 0.022, ...]
    }
  ],
  "model": "llama-3.1-8b",
  "usage": { "prompt_tokens": 12, "total_tokens": 12 }
}`,
  },

  // ── Models ─────────────────────────────────────────────────────────────────

  {
    id: "list-models",
    method: "GET",
    path: "/v1/deployments/{deploymentId}/models",
    subdomainPath: "/v1/models",
    title: "List Models",
    description:
      "Returns a list of all models currently available through this deployment. Use the returned `id` as the `model` field in other requests.",
    category: "Models",
    gateway: true,
    curl: (opts) =>
      `curl ${scopedBase(opts)}/models \\
  -H "Authorization: Bearer ${opts.key}"`,
    responseExample: `{
  "object": "list",
  "data": [
    {
      "id": "llama-3.1-8b",
      "object": "model",
      "created": 1710000000,
      "owned_by": "llmpanel"
    }
  ]
}`,
  },

  {
    id: "retrieve-model",
    method: "GET",
    path: "/v1/models/{model}",
    subdomainPath: "/v1/models/{model}",
    title: "Retrieve Model",
    description: "Retrieve metadata about a specific model by its identifier.",
    category: "Models",
    gateway: true,
    params: [
      { name: "model", type: "path param", required: true, description: "The model id returned by List Models.", example: "meta-llama/Llama-3.1-8B-Instruct" },
    ],
    curl: (opts) =>
      `curl ${apiV1(opts)}/models/${opts.model} \\
  -H "Authorization: Bearer ${opts.key}"`,
    responseExample: `{
  "id": "llama-3.1-8b",
  "object": "model",
  "created": 1710000000,
  "owned_by": "llmpanel"
}`,
  },

  // ── vLLM-specific ──────────────────────────────────────────────────────────

  {
    id: "tokenize",
    method: "POST",
    path: "/v1/deployments/{deploymentId}/tokenize",
    subdomainPath: "/v1/tokenize",
    title: "Tokenize",
    description:
      "Convert a string prompt into token IDs using the model's tokenizer. Useful for counting tokens before sending a request, or for debugging prompt formatting.",
    category: "vLLM",
    gateway: true,
    params: [
      { name: "model", type: "string", required: false, description: "Model id. Defaults to this deployment's model.", example: '"llama-3.1-8b"' },
      { name: "prompt", type: "string", required: true, description: "Text to tokenize.", example: '"Hello, world!"' },
      { name: "add_special_tokens", type: "boolean", required: false, description: "Whether to add special tokens (BOS/EOS). Defaults to false.", example: "false" },
    ],
    curl: (opts) =>
      `curl ${scopedBase(opts)}/tokenize \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${opts.key}" \\
  -d '{"prompt": "Hello, world!"}'`,
    responseExample: `{
  "tokens": [15496, 11, 995, 0],
  "count": 4
}`,
  },

  {
    id: "detokenize",
    method: "POST",
    path: "/v1/deployments/{deploymentId}/detokenize",
    subdomainPath: "/v1/detokenize",
    title: "Detokenize",
    description: "Convert a list of token IDs back into a readable string using the model's tokenizer.",
    category: "vLLM",
    gateway: true,
    params: [
      { name: "model", type: "string", required: false, description: "Model id. Defaults to this deployment's model.", example: '"llama-3.1-8b"' },
      { name: "tokens", type: "array<integer>", required: true, description: "Array of token IDs to decode.", example: "[15496, 11, 995, 0]" },
    ],
    curl: (opts) =>
      `curl ${scopedBase(opts)}/detokenize \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${opts.key}" \\
  -d '{"tokens": [15496, 11, 995, 0]}'`,
    responseExample: `{
  "prompt": "Hello, world!"
}`,
  },

  {
    id: "health",
    method: "GET",
    path: "/v1/deployments/{deploymentId}/health",
    subdomainPath: "/v1/health",
    title: "Health Check",
    description:
      "Returns HTTP 200 when the inference server is ready to accept requests. Use this endpoint to probe deployment readiness in your infrastructure. Proxied through the LLMPanel gateway, so it requires an API key.",
    category: "vLLM",
    gateway: true,
    curl: (opts) =>
      `curl ${scopedBase(opts)}/health \\
  -H "Authorization: Bearer ${opts.key}"`,
    responseExample: `HTTP/1.1 200 OK`,
  },

  {
    id: "metrics",
    method: "GET",
    path: "/v1/deployments/{deploymentId}/metrics",
    subdomainPath: "/v1/metrics",
    title: "Prometheus Metrics",
    description:
      "Returns Prometheus-formatted metrics for the inference server including request counts, latencies, token throughput, KV cache utilisation, and GPU stats. Scrape this endpoint with Prometheus or Grafana. Proxied through the LLMPanel gateway, so it requires an API key.",
    category: "vLLM",
    gateway: true,
    curl: (opts) =>
      `curl ${scopedBase(opts)}/metrics \\
  -H "Authorization: Bearer ${opts.key}"`,
    responseExample: `# HELP vllm:num_requests_running Number of requests currently running on GPU
# TYPE vllm:num_requests_running gauge
vllm:num_requests_running 2

# HELP vllm:gpu_cache_usage_perc GPU KV-cache usage
# TYPE vllm:gpu_cache_usage_perc gauge
vllm:gpu_cache_usage_perc 0.32

# HELP vllm:request_success_total Total successful requests
# TYPE vllm:request_success_total counter
vllm:request_success_total{finished_reason="stop"} 1547`,
  },
]

const IMAGE_GEN_PARAMS: Parameter[] = [
  { name: "prompt", type: "string", required: true, description: "Text description of the image to generate.", example: '"A red panda astronaut, studio lighting"' },
  { name: "negative_prompt", type: "string", required: false, description: "What the model should avoid. Ignored by FLUX-style distilled models.", example: '"blurry, low quality"' },
  { name: "width", type: "integer", required: false, description: "Image width in pixels (128–2048). Defaults to 1024.", example: "1024" },
  { name: "height", type: "integer", required: false, description: "Image height in pixels (128–2048). Defaults to 1024.", example: "1024" },
  { name: "size", type: "string", required: false, description: 'OpenAI-style size alias, e.g. `"1024x1024"`. Overrides width/height.', example: '"1024x1024"' },
  { name: "num_inference_steps", type: "integer", required: false, description: "Denoising steps (1–100). Turbo models need only 1–8; base models 28–50.", example: "8" },
  { name: "guidance_scale", type: "number", required: false, description: "Classifier-free guidance strength (0–20). Use 0 for turbo/distilled models.", example: "3.5" },
  { name: "n", type: "integer", required: false, description: "Number of images to generate (1–4).", example: "1" },
  { name: "seed", type: "integer", required: false, description: "Random seed for reproducible generations. Omit for a random seed.", example: "42" },
]

const IMAGE_GEN_RESPONSE = `{
  "created": 1710000000,
  "model": "Tongyi-MAI/Z-Image-Turbo",
  "data": [
    {
      "url": "http://localhost:8000/api/v1/images/files/1f7f0f9e-….png"
    }
  ]
}`

function imageBodyJson(indent: string): string {
  return `{
${indent}  "prompt": "A red panda astronaut floating in space, studio lighting",
${indent}  "width": 1024,
${indent}  "height": 1024,
${indent}  "num_inference_steps": 8,
${indent}  "guidance_scale": 3.5,
${indent}  "n": 1
${indent}}`
}

function imageCurl(url: string, key: string): string {
  return `curl ${url} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${key}" \\
  -d '${imageBodyJson("")}'`
}

function imagePython(url: string, key: string): string {
  return `import requests

response = requests.post(
    "${url}",
    headers={"Authorization": "Bearer ${key}"},
    json={
        "prompt": "A red panda astronaut floating in space, studio lighting",
        "width": 1024,
        "height": 1024,
        "num_inference_steps": 8,
        "guidance_scale": 3.5,
        "n": 1,
    },
)
response.raise_for_status()

for image in response.json()["data"]:
    print(image["url"])`
}

function imageJavascript(url: string, key: string): string {
  return `const response = await fetch("${url}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer ${key}",
  },
  body: JSON.stringify({
    prompt: "A red panda astronaut floating in space, studio lighting",
    width: 1024,
    height: 1024,
    num_inference_steps: 8,
    guidance_scale: 3.5,
    n: 1,
  }),
})

const { data } = await response.json()
for (const image of data) console.log(image.url)`
}

export const IMAGE_ENDPOINTS: Endpoint[] = [
  {
    id: "image-generations",
    method: "POST",
    path: "/v1/deployments/{deploymentId}/images/generations",
    subdomainPath: "/v1/images/generations",
    title: "Generate Images",
    description:
      "Generate images from a text prompt with this deployment's model. Served by the LLMPanel gateway: requests are authenticated with your API key, logged, and the generated images are persisted and returned as hosted URLs.",
    category: "Images",
    gateway: true,
    params: IMAGE_GEN_PARAMS,
    curl: (opts) => imageCurl(`${scopedBase(opts)}/images/generations`, opts.key),
    python: (opts) => imagePython(`${scopedBase(opts)}/images/generations`, opts.key),
    javascript: (opts) => imageJavascript(`${scopedBase(opts)}/images/generations`, opts.key),
    responseExample: IMAGE_GEN_RESPONSE,
  },
  {
    id: "image-generations-default",
    method: "POST",
    path: "/v1/images/generations",
    subdomainPath: "/v1/images/generations",
    title: "Generate Images (key-bound)",
    description:
      "Same as Generate Images, but the target deployment is resolved from the API key itself — or, for workspace-wide keys, from the `model` field in the request body. Handy for OpenAI-SDK-style integrations that can't carry a deployment id in the path.",
    category: "Images",
    gateway: true,
    params: IMAGE_GEN_PARAMS,
    curl: (opts) => imageCurl(`${apiV1(opts)}/images/generations`, opts.key),
    python: (opts) => imagePython(`${apiV1(opts)}/images/generations`, opts.key),
    javascript: (opts) => imageJavascript(`${apiV1(opts)}/images/generations`, opts.key),
    responseExample: IMAGE_GEN_RESPONSE,
  },
  {
    id: "image-list-models",
    method: "GET",
    path: "/v1/models",
    subdomainPath: "/v1/models",
    title: "List Models",
    description:
      "Lists your running deployments as OpenAI-style models, including image deployments.",
    category: "Models",
    gateway: true,
    curl: (opts) =>
      `curl ${apiV1(opts)}/models \\
  -H "Authorization: Bearer ${opts.key}"`,
    responseExample: `{
  "object": "list",
  "data": [
    {
      "id": "Tongyi-MAI/Z-Image-Turbo",
      "object": "model",
      "created": 1710000000,
      "owned_by": "llmpanel"
    }
  ]
}`,
  },
  {
    id: "image-health",
    method: "GET",
    path: "/health",
    title: "Health Check",
    description:
      "Returns the image server's readiness directly from the inference container, including whether the model weights are loaded.",
    category: "Server",
    curl: ({ base }) => `curl ${base}/health`,
    responseExample: `{
  "status": "ok",
  "model": "Tongyi-MAI/Z-Image-Turbo",
  "model_loaded": true,
  "error": null
}`,
  },
]

export const CATEGORIES: EndpointCategory[] = ["Chat", "Completions", "Embeddings", "Images", "Models", "vLLM", "Server"]

/** Pick the endpoint set for a deployment: image models get the Images docs, LLMs the OpenAI-compatible set. */
export function endpointsForModelType(modelType: string | null | undefined): Endpoint[] {
  if (modelType === "image-generation") return IMAGE_ENDPOINTS
  return ENDPOINTS
}
