# Vast.ai Integration

> Reference for the Vast.ai provider implementation and API quirks.

## API Base

```
https://console.vast.ai/api/v0
```

All requests require `Authorization: Bearer <API_KEY>` header.

## Instance Creation

**Endpoint:** `PUT /asks/{offer_id}/`

**Key Parameters:**

| Parameter | Type | Notes |
|-----------|------|-------|
| `image` | string | Docker image (e.g., `vllm/vllm-openai:latest`) |
| `env` | string | Docker flags format: `"-e KEY=VAL -p 8000:8000"` |
| `onstart` | string | Shell commands executed at startup |
| `disk` | number | Local disk in GB |
| `runtype` | string | `"args"` for entrypoint mode, `"ssh_direct"` for SSH |
| `label` | string | Custom instance name |

**Important:** The `env` field is a **string in Docker flags format**, NOT a JSON object:

```
"-e HF_TOKEN=hf_xxx -e HUGGING_FACE_HUB_TOKEN=hf_xxx -p 8000:8000"
```

**Response:** `{ success: true, new_contract: 123456 }`

The `new_contract` is the instance/contract ID used for all subsequent calls.

## vLLM Deployment

We use the `vllm/vllm-openai:latest` Docker image with the `onstart` field containing vLLM serve args:

```
--model <huggingfaceId> --host 0.0.0.0 --port 8000 --max-model-len <len> --enable-prefix-caching
```

For multi-GPU: add `--tensor-parallel-size <gpuCount>`

For SGLang: use `lmsysorg/sglang:latest` with `--model-path` and `--tp-size`.

## Instance Status Polling

**Endpoint:** `GET /instances/{id}/`

**Response wraps in:** `{ instances: [...] }`

**Key fields per instance:**

| Field | Type | Notes |
|-------|------|-------|
| `actual_status` | string/null | `"created"`, `"loading"`, `"running"`, `"stopped"`, `"exited"` |
| `cur_state` | string | Current state (fallback when actual_status is null) |
| `public_ipaddr` | string/null | Public IP (null until assigned) |
| `ports` | object/null | Docker-format: `{ "8000/tcp": [{ "HostIp": "0.0.0.0", "HostPort": "8000" }] }` |
| `dph_total` | number | Cost per hour USD |
| `gpu_name` | string | GPU model name |
| `status_msg` | string/null | Human-readable status message |

### Endpoint is Null on Creation

Vast.ai does NOT assign an IP immediately. After `PUT /asks/{id}/`, the instance goes through:

1. `created` (no IP) — provisioning hardware
2. `loading` (may have IP) — pulling Docker image
3. `running` (has IP + ports) — ready for traffic

**The deployment service must poll `getDeploymentInfo()` until endpoint is non-null.** This is handled by `waitForEndpoint()` in `deployment.service.ts` with a 10-minute timeout (120 attempts x 5s).

### Status Mapping

| Vast.ai status | LLMPanel status |
|----------------|-----------------|
| `created` | `provisioning` |
| `loading` | `downloading` |
| `running` | `running` |
| `stopped` | `stopped` |
| `exited` | `stopped` |

## Instance Logs

**Endpoint:** `PUT /instances/request_logs/{id}/`

**Body:** `{ tail: "1000" }` (optional `filter` for grep)

**Response:** `{ success: true, result_url: "https://s3..." }`

Logs are uploaded to S3 asynchronously. Fetch the `result_url` to get plain-text logs. Our `streamLogs()` polls this every 3 seconds and yields new lines since the last poll.

## Stopping Instances

**Endpoint:** `DELETE /instances/{id}/`

This permanently destroys the instance. Vast.ai has no pause/resume — `restartDeployment` destroys and re-provisions.

## Cloud Provider Endpoint Polling Pattern

Both Vast.ai and RunPod return `endpoint: null` from `deployModel()`. The deployment service handles this with:

1. `deployModel()` returns `externalId` + null endpoint
2. `waitForEndpoint()` polls `getDeploymentInfo()` every 5s for up to 10 minutes
3. Each poll updates the DB status for SSE visibility
4. Once endpoint resolves, proceed to health check
5. `trackDownloadProgress()` runs concurrently (best-effort for cloud providers)

This differs from the local Docker provider which returns an endpoint immediately.

## Testing Checklist

- [ ] Instance appears in Vast.ai dashboard after creation
- [ ] `getDeploymentInfo()` returns correct status transitions
- [ ] Endpoint resolves once instance has a public IP
- [ ] Health check passes against `{endpoint}/health`
- [ ] SSE streams correct status updates to frontend
- [ ] Logs SSE shows real container output
- [ ] Cleanup destroys instance on failure
- [ ] Mock mode still works unchanged on macOS
