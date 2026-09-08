# RunPod REST API Reference

> Base URL: `https://rest.runpod.io/v1`
> Auth: `Authorization: Bearer <RUNPOD_API_KEY>` header on every request.
> Content-Type: `application/json` for all request bodies.
> OpenAPI spec: `GET /openapi.json`

---

## Table of Contents

1. [Pods](#1-pods)
2. [Serverless Endpoints](#2-serverless-endpoints)
3. [Network Volumes](#3-network-volumes)
4. [Templates](#4-templates)
5. [Container Registry Auth](#5-container-registry-auth)
6. [Billing](#6-billing)
7. [Common Enums](#7-common-enums)
8. [TypeScript Helper](#8-typescript-helper)

---

## 1. Pods

Persistent GPU/CPU instances for development, training, and long-running workloads.

### 1.1 Create a Pod

```
POST /pods
```

**Request Body:**

```jsonc
{
  // REQUIRED (at least imageName or templateId)
  "imageName": "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",

  // OPTIONAL - GPU/CPU selection
  "computeType": "GPU",                    // "GPU" | "CPU" (default: "GPU")
  "cloudType": "SECURE",                   // "SECURE" | "COMMUNITY" (default: "SECURE")
  "gpuCount": 1,                           // integer >= 1 (default: 1)
  "gpuTypeIds": ["NVIDIA GeForce RTX 4090"], // see GPU_TYPE_IDS enum
  "gpuTypePriority": "availability",       // "availability" | "custom"
  "cpuFlavorIds": ["cpu3c"],               // for CPU pods: "cpu3c","cpu3g","cpu3m","cpu5c","cpu5g","cpu5m"
  "cpuFlavorPriority": "availability",     // "availability" | "custom"
  "vcpuCount": 2,                          // for CPU pods (default: 2)

  // OPTIONAL - Location
  "dataCenterIds": ["EU-RO-1", "CA-MTL-1"], // see DATA_CENTER_IDS enum
  "dataCenterPriority": "availability",     // "availability" | "custom"
  "countryCodes": ["US", "DE"],

  // OPTIONAL - Storage
  "containerDiskInGb": 50,                 // ephemeral disk (default: 50, wiped on restart)
  "volumeInGb": 20,                        // persistent local volume (default: 20)
  "volumeMountPath": "/workspace",         // mount path (default: "/workspace")
  "networkVolumeId": "<string>",           // attach shared network volume

  // OPTIONAL - Networking
  "ports": ["8888/http", "22/tcp"],        // format: "PORT/PROTOCOL"
  "supportPublicIp": true,                 // request public IP (Community Cloud)
  "globalNetworking": false,               // global networking (limited availability)

  // OPTIONAL - Container config
  "dockerEntrypoint": [],                  // override ENTRYPOINT
  "dockerStartCmd": [],                    // override CMD
  "env": { "KEY": "value" },              // environment variables
  "containerRegistryAuthId": "<string>",   // for private images
  "templateId": null,                      // use a saved template

  // OPTIONAL - Requirements
  "allowedCudaVersions": ["12.6"],         // see CUDA_VERSIONS enum
  "minRAMPerGPU": 8,                       // GB per GPU (default: 8)
  "minVCPUPerGPU": 2,                      // vCPUs per GPU (default: 2)
  "minDownloadMbps": 500,
  "minUploadMbps": 500,
  "minDiskBandwidthMBps": 500,

  // OPTIONAL - Billing
  "interruptible": false,                  // spot instance (cheaper, can be preempted)
  "locked": false,                         // prevent stop/reset

  // OPTIONAL - Name
  "name": "my pod"                         // max 191 chars, non-unique
}
```

**Response `201`:**

```jsonc
{
  "id": "xedezhzb9la3ye",                 // Pod ID
  "name": "my pod",
  "desiredStatus": "RUNNING",             // "RUNNING" | "EXITED" | "TERMINATED"
  "image": "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",
  "costPerHr": "0.74",                    // base cost (USD/hr)
  "adjustedCostPerHr": 0.69,              // after savings plans
  "machineId": "s194cr8pls2z",
  "memoryInGb": 62,
  "vcpuCount": 24,
  "containerDiskInGb": 50,
  "volumeInGb": 20,
  "volumeMountPath": "/workspace",
  "volumeEncrypted": false,
  "interruptible": false,
  "locked": false,
  "publicIp": "100.65.0.119",             // null if not yet assigned
  "ports": ["8888/http", "22/tcp"],
  "portMappings": { "22": 10341 },        // internal → public port map
  "lastStartedAt": "2024-07-12T19:14:40.144Z",
  "lastStatusChange": "Rented by User: ...",
  "env": { "KEY": "value" },
  "dockerEntrypoint": [],
  "dockerStartCmd": [],
  "consumerUserId": "user_xxx",
  "containerRegistryAuthId": null,
  "cpuFlavorId": null,
  "endpointId": null,
  "templateId": null,
  "gpu": {
    "id": "<string>",
    "count": 1,
    "displayName": "NVIDIA GeForce RTX 4090",
    "securePrice": 0.74,
    "communityPrice": 0.39,
    "communitySpotPrice": 0.29,
    "secureSpotPrice": 0.54,
    "oneWeekPrice": 0.64,
    "oneMonthPrice": 0.54,
    "threeMonthPrice": 0.49,
    "sixMonthPrice": 0.44
  },
  "machine": {
    "location": "EU-RO-1",
    "dataCenterId": "EU-RO-1",
    "gpuTypeId": "NVIDIA GeForce RTX 4090",
    "gpuAvailable": 4,
    "gpuDisplayName": "RTX 4090",
    "cpuCount": 32,
    "supportPublicIp": true,
    "secureCloud": true,
    "diskThroughputMBps": 2000,
    "maxDownloadSpeedMbps": 2000,
    "maxUploadSpeedMbps": 2000,
    "costPerHr": 0.74,
    "currentPricePerGpu": 0.74,
    "minPodGpuCount": 1
  },
  "networkVolume": {                       // null if none attached
    "id": "agv6w2qcg7",
    "name": "my network volume",
    "size": 50,
    "dataCenterId": "EU-RO-1"
  },
  "savingsPlans": []                       // active savings plans array
}
```

---

### 1.2 List Pods

```
GET /pods
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `computeType` | `"GPU"` \| `"CPU"` | Filter by compute type |
| `desiredStatus` | `"RUNNING"` \| `"EXITED"` \| `"TERMINATED"` | Filter by status |
| `id` | string | Filter by specific Pod ID |
| `name` | string | Filter by Pod name (max 191 chars) |
| `gpuTypeId` | string[] | Filter by GPU types |
| `cpuFlavorId` | string[] | Filter by CPU flavors |
| `dataCenterId` | string[] | Filter by data centers |
| `imageName` | string | Filter by image |
| `templateId` | string | Filter by template |
| `networkVolumeId` | string | Filter by network volume |
| `endpointId` | string | Filter by serverless endpoint |
| `includeMachine` | boolean | Include machine details (default: false) |
| `includeNetworkVolume` | boolean | Include network volume details (default: false) |
| `includeSavingsPlans` | boolean | Include savings plans (default: false) |
| `includeTemplate` | boolean | Include template details (default: false) |
| `includeWorkers` | boolean | Include serverless workers (default: false) |

**Response `200`:** Array of Pod objects (same schema as Create response).

---

### 1.3 Get Pod by ID

```
GET /pods/{podId}
```

**Response `200`:** Single Pod object.

---

### 1.4 Update Pod (PATCH)

```
PATCH /pods/{podId}
```

**Request Body:** Partial Pod creation fields (only fields you want to change).

**Response `200`:** Updated Pod object.

---

### 1.5 Update Pod (POST — full replace)

```
POST /pods/{podId}/update
```

**Request Body:** Same as Create Pod body.

**Response `200`:** Updated Pod object.

---

### 1.6 Delete Pod

```
DELETE /pods/{podId}
```

**Response `200`:** Empty or confirmation.

---

### 1.7 Start / Resume Pod

```
POST /pods/{podId}/start
```

**Request Body:** (optional) Same fields as Create Pod — allows overriding GPU type, etc. on resume.

**Response `200`:** Pod object with `desiredStatus: "RUNNING"`.

---

### 1.8 Stop Pod

```
POST /pods/{podId}/stop
```

Stops the Pod gracefully. Volume data persists.

**Response `200`:** Pod object with `desiredStatus: "EXITED"`.

---

### 1.9 Reset Pod

```
POST /pods/{podId}/reset
```

Stops the Pod and wipes the container disk. Volume data persists.

**Response `200`:** Pod object.

---

### 1.10 Restart Pod

```
POST /pods/{podId}/restart
```

Restarts the Pod without wiping container disk.

**Response `200`:** Pod object.

---

## 2. Serverless Endpoints

Deploy and scale containerized applications with autoscaling and job monitoring.

### 2.1 Create Endpoint

```
POST /endpoints
```

**Request Body:**

```jsonc
{
  // REQUIRED
  "templateId": "30zmvf89kd",             // template defining the worker image

  // OPTIONAL - Compute
  "computeType": "GPU",                   // "GPU" | "CPU" (default: "GPU")
  "gpuCount": 1,                          // GPUs per worker (default: 1)
  "gpuTypeIds": ["NVIDIA GeForce RTX 4090"], // see GPU_TYPE_IDS enum
  "cpuFlavorIds": ["cpu3c"],              // for CPU endpoints
  "vcpuCount": 2,                         // vCPUs per CPU worker (default: 2)

  // OPTIONAL - CUDA
  "allowedCudaVersions": ["12.6"],
  "minCudaVersion": "12.0",

  // OPTIONAL - Location
  "dataCenterIds": ["EU-RO-1", "CA-MTL-1"],

  // OPTIONAL - Scaling
  "workersMin": 0,                        // always-on workers (billed at lower rate)
  "workersMax": 3,                        // max concurrent workers
  "scalerType": "QUEUE_DELAY",            // "QUEUE_DELAY" | "REQUEST_COUNT"
  "scalerValue": 4,                       // seconds (QUEUE_DELAY) or requests-per-worker (REQUEST_COUNT)
  "idleTimeout": 5,                       // seconds before idle worker scales down (1-3600, default: 5)

  // OPTIONAL - Execution
  "executionTimeoutMs": 600000,           // max request runtime in ms
  "flashboot": true,                      // enable flash boot

  // OPTIONAL - Storage
  "networkVolumeId": "<string>",          // single network volume
  "networkVolumeIds": ["vol1", "vol2"],   // multi-region network volumes

  // OPTIONAL - Name
  "name": "my endpoint"                   // max 191 chars
}
```

**Response `200`:**

```jsonc
{
  "id": "jpnw0v75y3qoql",
  "name": "my endpoint",
  "templateId": "30zmvf89kd",
  "userId": "user_xxx",
  "version": 0,                           // increments on config change
  "createdAt": "2024-07-12T19:14:40.144Z",
  "computeType": "GPU",
  "gpuCount": 1,
  "gpuTypeIds": ["NVIDIA GeForce RTX 4090"],
  "allowedCudaVersions": ["12.6"],
  "minCudaVersion": "12.0",
  "dataCenterIds": "EU-NL-1,EU-RO-1",    // NOTE: comma-separated string in response
  "executionTimeoutMs": 600000,
  "idleTimeout": 5,
  "scalerType": "QUEUE_DELAY",
  "scalerValue": 4,
  "workersMin": 0,
  "workersMax": 3,
  "networkVolumeId": "agv6w2qcg7",
  "networkVolumeIds": ["agv6w2qcg7"],
  "instanceIds": ["cpu3c-8-16"],          // CPU instance IDs (CPU endpoints only)
  "env": { "KEY": "value" },
  "template": { /* full Template object */ },
  "workers": [ /* array of Pod objects representing current workers */ ]
}
```

---

### 2.2 List Endpoints

```
GET /endpoints
```

**Response `200`:** Array of Endpoint objects.

---

### 2.3 Get Endpoint by ID

```
GET /endpoints/{endpointId}
```

**Response `200`:** Single Endpoint object.

---

### 2.4 Update Endpoint (PATCH)

```
PATCH /endpoints/{endpointId}
```

**Request Body:** Partial — only changed fields.

**Response `200`:** Updated Endpoint object.

---

### 2.5 Update Endpoint (POST — full replace)

```
POST /endpoints/{endpointId}/update
```

**Request Body:** Same as Create Endpoint body.

**Response `200`:** Updated Endpoint object.

---

### 2.6 Delete Endpoint

```
DELETE /endpoints/{endpointId}
```

**Response `200`:** Empty or confirmation.

---

## 3. Network Volumes

Persistent storage that can be attached to multiple Pods or endpoints.

### 3.1 Create Network Volume

```
POST /networkvolumes
```

**Request Body:**

```jsonc
{
  "dataCenterId": "EU-RO-1",   // REQUIRED — data center location
  "name": "my network volume",  // REQUIRED — display name
  "size": 50                    // REQUIRED — size in GB (0–4000)
}
```

**Response `200`:**

```jsonc
{
  "id": "agv6w2qcg7",
  "dataCenterId": "EU-RO-1",
  "name": "my network volume",
  "size": 50
}
```

---

### 3.2 List Network Volumes

```
GET /networkvolumes
```

**Response `200`:** Array of NetworkVolume objects.

---

### 3.3 Get Network Volume by ID

```
GET /networkvolumes/{networkVolumeId}
```

**Response `200`:** Single NetworkVolume object.

---

### 3.4 Update Network Volume (PATCH)

```
PATCH /networkvolumes/{networkVolumeId}
```

**Request Body:** Partial fields (`name`, `size`).

**Response `200`:** Updated NetworkVolume object.

---

### 3.5 Update Network Volume (POST — full replace)

```
POST /networkvolumes/{networkVolumeId}/update
```

**Request Body:** Same as Create body.

**Response `200`:** Updated NetworkVolume object.

---

### 3.6 Delete Network Volume

```
DELETE /networkvolumes/{networkVolumeId}
```

**Response `200`:** Empty or confirmation.

---

## 4. Templates

Saved Pod/endpoint configurations for reuse.

### 4.1 Create Template

```
POST /templates
```

**Request Body:**

```jsonc
{
  // REQUIRED
  "imageName": "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",
  "name": "my template",                  // must be unique

  // OPTIONAL
  "category": "NVIDIA",                   // "NVIDIA" | "AMD" | "CPU" (default: "NVIDIA")
  "isServerless": false,                  // true = serverless worker template
  "isPublic": false,                      // visible to other users
  "containerDiskInGb": 50,               // default: 50
  "volumeInGb": 20,                       // default: 20
  "volumeMountPath": "/workspace",        // default: "/workspace"
  "dockerEntrypoint": [],                 // override ENTRYPOINT
  "dockerStartCmd": [],                   // override CMD
  "env": { "KEY": "value" },
  "ports": ["8888/http", "22/tcp"],
  "containerRegistryAuthId": "<string>",  // for private images
  "readme": ""                            // markdown description
}
```

**Response `200`:**

```jsonc
{
  "id": "30zmvf89kd",
  "name": "my template",
  "imageName": "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",
  "category": "NVIDIA",
  "isServerless": false,
  "isPublic": false,
  "isRunpod": false,                      // true if official RunPod template
  "containerDiskInGb": 50,
  "volumeInGb": 20,
  "volumeMountPath": "/workspace",
  "dockerEntrypoint": [],
  "dockerStartCmd": [],
  "env": { "KEY": "value" },
  "ports": ["8888/http", "22/tcp"],
  "containerRegistryAuthId": null,
  "readme": "",
  "earned": 0,                            // credits earned from others using template
  "runtimeInMin": 0
}
```

---

### 4.2 List Templates

```
GET /templates
```

**Response `200`:** Array of Template objects.

---

### 4.3 Get Template by ID

```
GET /templates/{templateId}
```

**Response `200`:** Single Template object.

---

### 4.4 Update Template (PATCH)

```
PATCH /templates/{templateId}
```

**Request Body:** Partial fields.

**Response `200`:** Updated Template object.

---

### 4.5 Update Template (POST — full replace)

```
POST /templates/{templateId}/update
```

**Request Body:** Same as Create body.

**Response `200`:** Updated Template object.

---

### 4.6 Delete Template

```
DELETE /templates/{templateId}
```

**Response `200`:** Empty or confirmation.

---

## 5. Container Registry Auth

Connect to private Docker registries.

### 5.1 Create Registry Auth

```
POST /containerregistryauth
```

**Request Body:**

```jsonc
{
  "name": "my creds",          // REQUIRED — must be unique
  "username": "my-username",   // REQUIRED
  "password": "my-password"    // REQUIRED
}
```

**Response `200`:**

```jsonc
{
  "id": "clzdaifot0001l90809257ynb",
  "name": "my creds"
}
```

---

### 5.2 List Registry Auths

```
GET /containerregistryauth
```

**Response `200`:** Array of `{ id, name }` objects.

---

### 5.3 Get Registry Auth by ID

```
GET /containerregistryauth/{containerRegistryAuthId}
```

**Response `200`:** Single `{ id, name }` object.

---

### 5.4 Delete Registry Auth

```
DELETE /containerregistryauth/{containerRegistryAuthId}
```

**Response `200`:** Empty or confirmation.

---

## 6. Billing

Access usage metrics and billing information.

### 6.1 Pod Billing History

```
GET /billing/pods
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `startTime` | ISO datetime | — | Start of billing period |
| `endTime` | ISO datetime | — | End of billing period |
| `bucketSize` | `"hour"` \| `"day"` \| `"week"` \| `"month"` \| `"year"` | `"day"` | Aggregation period |
| `grouping` | `"podId"` \| `"gpuTypeId"` | `"gpuTypeId"` | Group records by |
| `podId` | string | — | Filter by Pod |
| `gpuTypeId` | string | — | Filter by GPU type |

**Response `200`:**

```jsonc
[
  {
    "time": "2023-01-01T00:00:00Z",    // period start
    "amount": 100.5,                    // USD charged
    "timeBilledMs": 3600000,            // runtime billed (ms)
    "diskSpaceBilledGb": 50,            // disk billed (GB)
    "podId": "<string>",               // if grouped by podId
    "gpuTypeId": "<string>",           // if grouped by gpuTypeId
    "endpointId": "<string>"           // if worker pod
  }
]
```

---

### 6.2 Serverless Billing History

```
GET /billing/endpoints
```

Same query parameters as Pod billing (substitute `endpointId` for `podId`).

**Response `200`:** Same schema as Pod billing.

---

### 6.3 Network Volume Billing History

```
GET /billing/networkvolumes
```

Same query parameters (substitute `networkVolumeId`).

**Response `200`:** Same schema as Pod billing.

---

## 7. Common Enums

### GPU Type IDs

```
NVIDIA GeForce RTX 5090
NVIDIA GeForce RTX 5080
NVIDIA GeForce RTX 4090
NVIDIA GeForce RTX 4080 SUPER
NVIDIA GeForce RTX 4080
NVIDIA GeForce RTX 4070 Ti
NVIDIA GeForce RTX 3090 Ti
NVIDIA GeForce RTX 3090
NVIDIA GeForce RTX 3080 Ti
NVIDIA GeForce RTX 3080
NVIDIA GeForce RTX 3070
NVIDIA B200
NVIDIA H200
NVIDIA H200 NVL
NVIDIA H100 80GB HBM3
NVIDIA H100 PCIe
NVIDIA H100 NVL
NVIDIA A100-SXM4-80GB
NVIDIA A100 80GB PCIe
NVIDIA L40S
NVIDIA L40
NVIDIA L4
NVIDIA A40
NVIDIA A30
NVIDIA RTX 6000 Ada Generation
NVIDIA RTX 5000 Ada Generation
NVIDIA RTX 4000 Ada Generation
NVIDIA RTX 4000 SFF Ada Generation
NVIDIA RTX 2000 Ada Generation
NVIDIA RTX A6000
NVIDIA RTX A5000
NVIDIA RTX A4500
NVIDIA RTX A4000
NVIDIA RTX A2000
NVIDIA RTX PRO 6000 Blackwell Server Edition
NVIDIA RTX PRO 6000 Blackwell Workstation Edition
NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition
AMD Instinct MI300X OAM
Tesla V100-SXM2-32GB
Tesla V100-SXM2-16GB
Tesla V100-PCIE-32GB
Tesla V100-PCIE-16GB
Tesla V100-FHHL-16GB
Tesla T4
```

### CPU Flavor IDs

| ID | Description |
|----|-------------|
| `cpu3c` | 3rd gen compute-optimized |
| `cpu3g` | 3rd gen general-purpose |
| `cpu3m` | 3rd gen memory-optimized |
| `cpu5c` | 5th gen compute-optimized |
| `cpu5g` | 5th gen general-purpose |
| `cpu5m` | 5th gen memory-optimized |

> **Note:** Serverless endpoints only support `cpu3c`, `cpu3g`, `cpu5c`, `cpu5g` (no memory-optimized).

### Data Center IDs

```
US-TX-1, US-TX-3, US-TX-4
US-IL-1, US-KS-2, US-KS-3
US-GA-1, US-GA-2, US-WA-1
US-CA-2, US-NC-1, US-DE-1
CA-MTL-1, CA-MTL-2, CA-MTL-3
EU-RO-1, EU-SE-1, EU-CZ-1, EU-NL-1, EU-FR-1
EUR-IS-1, EUR-IS-2, EUR-IS-3, EUR-NO-1
OC-AU-1, AP-JP-1
```

### CUDA Versions

```
13.0, 12.9, 12.8, 12.7, 12.6, 12.5, 12.4, 12.3, 12.2, 12.1, 12.0, 11.8
```

### Pod Desired Status

```
RUNNING, EXITED, TERMINATED
```

### Scaler Types (Serverless)

| Type | Behavior |
|------|----------|
| `QUEUE_DELAY` | Scale up when requests wait > `scalerValue` seconds |
| `REQUEST_COUNT` | Workers = ceil(queue_length / `scalerValue`) |

---

## 8. TypeScript Helper

A minimal typed wrapper for use in your codebase:

```typescript
const RUNPOD_BASE = "https://rest.runpod.io/v1";

async function runpod<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${RUNPOD_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RunPod ${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

// Examples:
// Create pod
const pod = await runpod("POST", "/pods", {
  imageName: "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",
  gpuTypeIds: ["NVIDIA GeForce RTX 4090"],
  gpuCount: 1,
  containerDiskInGb: 50,
  volumeInGb: 20,
  name: "inference-server",
});

// List pods
const pods = await runpod("GET", "/pods?desiredStatus=RUNNING");

// Stop pod
await runpod("POST", `/pods/${podId}/stop`);

// Delete pod
await runpod("DELETE", `/pods/${podId}`);

// Create template
const template = await runpod("POST", "/templates", {
  imageName: "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04",
  name: "vllm-inference",
  isServerless: false,
  ports: ["8000/http", "22/tcp"],
  env: { MODEL_NAME: "meta-llama/Llama-3.2-3B" },
});

// Create serverless endpoint
const endpoint = await runpod("POST", "/endpoints", {
  templateId: template.id,
  gpuTypeIds: ["NVIDIA GeForce RTX 4090"],
  workersMin: 0,
  workersMax: 3,
  scalerType: "QUEUE_DELAY",
  scalerValue: 4,
  idleTimeout: 5,
});

// Create network volume
const vol = await runpod("POST", "/networkvolumes", {
  dataCenterId: "US-TX-3",
  name: "model-weights",
  size: 100,
});

// Get billing
const billing = await runpod("GET", "/billing/pods?bucketSize=day&startTime=2024-01-01T00:00:00Z");
```

---

## Quick Reference: All Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/pods` | Create a Pod |
| `GET` | `/pods` | List Pods |
| `GET` | `/pods/{podId}` | Get Pod by ID |
| `PATCH` | `/pods/{podId}` | Partial update Pod |
| `DELETE` | `/pods/{podId}` | Delete Pod |
| `POST` | `/pods/{podId}/update` | Full update Pod |
| `POST` | `/pods/{podId}/start` | Start/resume Pod |
| `POST` | `/pods/{podId}/stop` | Stop Pod |
| `POST` | `/pods/{podId}/reset` | Reset Pod (wipes container disk) |
| `POST` | `/pods/{podId}/restart` | Restart Pod |
| `POST` | `/endpoints` | Create serverless endpoint |
| `GET` | `/endpoints` | List endpoints |
| `GET` | `/endpoints/{endpointId}` | Get endpoint by ID |
| `PATCH` | `/endpoints/{endpointId}` | Partial update endpoint |
| `DELETE` | `/endpoints/{endpointId}` | Delete endpoint |
| `POST` | `/endpoints/{endpointId}/update` | Full update endpoint |
| `POST` | `/networkvolumes` | Create network volume |
| `GET` | `/networkvolumes` | List network volumes |
| `GET` | `/networkvolumes/{id}` | Get network volume by ID |
| `PATCH` | `/networkvolumes/{id}` | Partial update network volume |
| `DELETE` | `/networkvolumes/{id}` | Delete network volume |
| `POST` | `/networkvolumes/{id}/update` | Full update network volume |
| `POST` | `/templates` | Create template |
| `GET` | `/templates` | List templates |
| `GET` | `/templates/{templateId}` | Get template by ID |
| `PATCH` | `/templates/{templateId}` | Partial update template |
| `DELETE` | `/templates/{templateId}` | Delete template |
| `POST` | `/templates/{templateId}/update` | Full update template |
| `POST` | `/containerregistryauth` | Create registry auth |
| `GET` | `/containerregistryauth` | List registry auths |
| `GET` | `/containerregistryauth/{id}` | Get registry auth by ID |
| `DELETE` | `/containerregistryauth/{id}` | Delete registry auth |
| `GET` | `/billing/pods` | Pod billing history |
| `GET` | `/billing/endpoints` | Serverless billing history |
| `GET` | `/billing/networkvolumes` | Network volume billing history |
