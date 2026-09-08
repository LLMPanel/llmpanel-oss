# Vast.ai REST API Reference

> Base URL: `https://console.vast.ai`
> Auth: `Authorization: Bearer <VAST_API_KEY>` header on every request.
> Content-Type: `application/json` for all request bodies.
> Rate Limits: Per-endpoint, per-identity. HTTP 429 on exceed. No `Retry-After` header — implement your own backoff.

---

## Table of Contents

1. [Search (Offers & Benchmarks)](#1-search)
2. [Instances](#2-instances)
3. [Templates](#3-templates)
4. [Volumes](#4-volumes)
5. [Network Volumes](#5-network-volumes)
6. [Serverless (Endpoints & Workergroups)](#6-serverless)
7. [Machines (Host Management)](#7-machines)
8. [Accounts](#8-accounts)
9. [Team](#9-team)
10. [Billing](#10-billing)
11. [Filter Operators](#11-filter-operators)
12. [Instance Creation Guide](#12-instance-creation-guide)
13. [Permissions Reference](#13-permissions-reference)
14. [TypeScript Helper](#14-typescript-helper)

---

## 1. Search

### 1.1 Search Offers (Find Available GPUs)

```
POST /api/v0/bundles/
```

This is the primary endpoint for discovering available machines before creating instances.

**Request Body:**

```jsonc
{
  // PAGINATION
  "limit": 100,                            // max results to return

  // INSTANCE TYPE
  "type": "ondemand",                      // "ondemand" | "bid" | "reserved"

  // COMMON FILTERS (each is an object with operator, see Filter Operators section)
  "verified": { "eq": true },             // machine verification status
  "rentable": { "eq": true },             // currently available for rent
  "rented": { "eq": false },              // exclude already-rented (set true to find your own machines)
  "gpu_name": { "in": ["RTX 4090"] },     // GPU model name
  "num_gpus": { "gte": 1 },               // number of GPUs
  "gpu_ram": { "gte": 24000 },            // GPU VRAM in MB
  "reliability": { "gte": 0.99 },         // reliability score 0–1

  // PERFORMANCE FILTERS
  "dlperf": { "gte": 20 },                // deep learning perf score
  "total_flops": { "gte": 50 },           // total TFLOPs
  "cuda_max_good": { "gte": 12.0 },       // max supported CUDA version
  "compute_cap": { "gte": 800 },          // CUDA compute cap × 100 (800 = 8.0)

  // HARDWARE FILTERS
  "cpu_cores": { "gte": 8 },              // virtual CPU count
  "cpu_cores_effective": { "gte": 4 },    // effective vCPUs for the offer
  "cpu_ram": { "gte": 32000 },            // CPU RAM in MB
  "cpu_ghz": { "gte": 2.5 },             // CPU clock speed GHz
  "cpu_arch": { "eq": "amd64" },          // "amd64" | "arm64"
  "gpu_arch": { "eq": "nvidia" },         // "nvidia" | "amd"
  "gpu_mem_bw": { "gte": 500 },           // GPU memory bandwidth GB/s
  "gpu_max_power": { "lte": 350 },        // GPU power limit watts
  "pci_gen": { "gte": 4 },                // PCIe generation
  "bw_nvlink": { "gte": 100 },            // NVLink bandwidth GB/s
  "has_avx": { "eq": 1 },                 // AVX instruction support

  // STORAGE & NETWORK
  "disk_space": { "gte": 100 },           // available disk GB
  "disk_bw": { "gte": 500 },              // disk read bandwidth MB/s
  "inet_down": { "gte": 500 },            // download speed MB/s
  "inet_up": { "gte": 100 },              // upload speed MB/s
  "inet_down_cost": { "lte": 0.01 },      // download cost $/GB
  "inet_up_cost": { "lte": 0.01 },        // upload cost $/GB

  // PRICING
  "dph_total": { "lte": 0.50 },           // total $/hour
  "min_bid": { "lte": 0.30 },             // minimum bid price
  "storage_cost": { "lte": 0.10 },        // storage $/GB/month

  // LOCATION
  "geolocation": { "in": ["US", "CA"] },  // two-letter country codes
  "static_ip": { "eq": true },            // stable IP address
  "direct_port_count": { "gte": 3 },      // available direct ports

  // OTHER
  "machine_id": { "eq": 12345 },          // specific machine
  "datacenter": { "eq": true },           // datacenter-only offers
  "vms_enabled": { "eq": false },         // VM instances

  // SORTING
  "order": [["dph_total", "asc"]],        // sort by field + direction

  // STORAGE ALLOCATION
  "allocated_storage": 50,                 // disk GB to allocate (default: 8)
  "disable_bundling": false                // disable offer bundling
}
```

**Response `200`:**

```jsonc
{
  "offers": [
    {
      "id": 12345678,                      // OFFER ID — use this to create instance
      "ask_contract_id": 12345678,
      "machine_id": 88888,
      "host_id": 55555,

      // GPU INFO
      "gpu_name": "RTX 4090",
      "gpu_arch": "nvidia",
      "gpu_ram": 24576,                    // per-GPU VRAM in MB
      "gpu_total_ram": 49152,              // total VRAM across all GPUs in MB
      "num_gpus": 2,
      "gpu_mem_bw": 888.8,                // GB/s
      "gpu_max_power": 450,               // watts
      "gpu_max_temp": 83,                 // celsius
      "gpu_frac": 1.0,                    // fraction of GPU offered
      "gpu_ids": [1111, 2222],
      "gpu_lanes": 16,
      "gpu_display_active": false,
      "bw_nvlink": 0,                     // NVLink bandwidth GB/s

      // CPU INFO
      "cpu_name": "AMD EPYC 7763",
      "cpu_arch": "amd64",
      "cpu_cores": 64,
      "cpu_cores_effective": 32,
      "cpu_ghz": 2.99,
      "cpu_ram": 65536,                   // MB
      "has_avx": 1,

      // STORAGE
      "disk_name": "Samsung PM9A3",
      "disk_space": 2048.5,              // GB available
      "disk_bw": 1234.5,                 // MB/s read

      // NETWORK
      "inet_down": 9876.5,              // MB/s download
      "inet_up": 8765.4,                // MB/s upload
      "inet_down_cost": 0.00123,         // $/GB
      "inet_up_cost": 0.00456,           // $/GB
      "direct_port_count": 42,
      "public_ipaddr": "203.0.113.42",
      "static_ip": true,

      // PRICING
      "dph_base": 0.123,                // base GPU $/hr
      "dph_total": 0.234,               // total $/hr (GPU + storage)
      "dph_total_adj": 0.345,            // adjusted after discounts
      "min_bid": 0.111,                  // minimum bid for interruptible
      "storage_cost": 0.05,              // $/GB/month
      "storage_total_cost": 0.123,
      "vram_costperhour": 0.009,
      "credit_discount_max": 0.15,       // max credit discount rate
      "discount_rate": 0.05,
      "discounted_hourly": 0.01,
      "discounted_dph_total": 0.224,
      "is_bid": false,

      // COST BREAKDOWNS
      "search": {
        "gpuCostPerHour": 0.123,
        "diskHour": 0.123,
        "totalHour": 0.234,
        "discountTotalHour": 0.01,
        "discountedTotalPerHour": 0.224
      },
      "instance": {
        "gpuCostPerHour": 0.01,
        "diskHour": 0.02,
        "totalHour": 0.03,
        "discountTotalHour": 0.001,
        "discountedTotalPerHour": 0.029
      },
      "internet_up_cost_per_tb": 1.23,
      "internet_down_cost_per_tb": 4.56,

      // PERFORMANCE
      "compute_cap": 890,               // CUDA compute cap × 100
      "cuda_max_good": 12.4,
      "dlperf": 222.22,                 // DL perf score
      "dlperf_per_dphtotal": 333.33,
      "total_flops": 999.99,            // TFLOPs
      "flops_per_dphtotal": 444.44,
      "pci_gen": 4,
      "pcie_bw": 99.9,

      // DRIVER
      "driver_version": "535.129.03",
      "os_version": "22.04",

      // LOCATION & STATUS
      "geolocation": "US, CA",
      "geolocode": 42424242,
      "hosting_type": 0,                 // 0 = community, 1 = datacenter
      "reliability": 0.9999,
      "reliability2": 0.9999,
      "expected_reliability": 0.95,
      "verification": "verified",        // "verified" | "deverified" | "unverified"
      "rentable": true,
      "rented": false,
      "duration": 1234567.89,           // seconds machine has been listed
      "start_date": 1893450000.5,       // unix timestamp
      "end_date": 1893456000,

      // VOLUME AVAILABILITY
      "avail_vol_ask_id": 333333,
      "avail_vol_dph": 0.000321,
      "avail_vol_size": 4096,

      // VM
      "vms_enabled": false,
      "resource_type": "gpu"
    }
  ]
}
```

---

### 1.2 Search Templates

```
GET /api/v0/template/search/
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | string | Search query for template names/descriptions |

**Response `200`:** Array of template objects.

---

### 1.3 Search Benchmarks

```
GET /api/v0/benchmarks/
```

**Response `200`:** Benchmark data for available machines.

---

## 2. Instances

### 2.1 Create Instance

```
PUT /api/v0/asks/{offer_id}/
```

**Two-step process:** First search offers (1.1), then pass the offer `id` as `{offer_id}`.

**Request Body:**

```jsonc
{
  // IMAGE — required unless using template_hash_id
  "image": "vllm/vllm-openai:latest",

  // TEMPLATE — optional, provides defaults for all fields
  "template_hash_id": "4e17788f74f075dd9aab7d0d4427968f",

  // INSTANCE CONFIG
  "label": "my-inference-server",          // custom name
  "disk": 50,                              // local disk GB (default: 8)
  "runtype": "ssh_direct",                 // see Runtype table below
  "target_state": "running",              // "running" | "stopped"

  // PRICING
  "price": 0.20,                          // bid $/hr (omit for on-demand)

  // CONTAINER CONFIG
  "env": {                                 // env vars + port mappings
    "HF_TOKEN": "hf_xxx",
    "MODEL_ID": "meta-llama/Llama-3.2-3B",
    "-p 8000:8000": "1",                   // port mapping syntax
    "-p 8080:8080": "1"
  },
  "onstart": "vllm serve $MODEL_ID --port 8000",  // startup commands (SSH/Jupyter runtypes)
  "args_str": "--model meta-llama/Llama-3.2-3B",  // replaces CMD (args runtype only)
  "args": ["bash", "-c", "echo hello"],            // args array alternative

  // JUPYTER
  "use_jupyter_lab": true,                 // JupyterLab vs Notebook
  "jupyter_dir": "/workspace",             // Jupyter root dir

  // LOCALE
  "python_utf8": true,                     // Python UTF-8 locale
  "lang_utf8": true,                       // System UTF-8 locale

  // PRIVATE IMAGES
  "image_login": "-u username -p token docker.io",

  // VOLUMES
  "volume_info": {
    "volume_id": 12345,                    // existing volume ID
    "mount_path": "/workspace"             // mount point
  },

  // OTHER
  "cancel_unavail": true,                  // fail fast if offer gone
  "vm": false,                             // VM instead of container
  "force": false                           // skip sanity checks
}
```

**Runtype Options:**

| Runtype | Ports Provisioned | Description |
|---------|-------------------|-------------|
| `ssh_direct` | 22 (SSH) | Direct SSH. **Recommended for headless.** |
| `ssh_proxy` / `ssh` | None | SSH via Vast proxy |
| `jupyter_direct` | 8080 + 22 | **Recommended.** Direct Jupyter + SSH |
| `jupyter_proxy` / `jupyter` | None | Jupyter + SSH via proxy |
| `args` | None | Preserves image ENTRYPOINT, `args_str` replaces CMD. No SSH/Jupyter |

**Response `200`:**

```jsonc
{
  "success": true,
  "new_contract": 1234568    // Instance ID
}
```

**Error Responses:** `400` (invalid args), `401` (unauthorized), `403` (forbidden), `404` (offer not found), `410` (offer gone), `429` (rate limited)

---

### 2.2 Show Instances (List All)

```
GET /api/v0/instances/
```

**Response `200`:** Object with `instances` array containing full instance details including `id`, `actual_status`, `gpu_name`, `num_gpus`, `dph_total`, `ssh_host`, `ssh_port`, `jupyter_url`, etc.

---

### 2.3 Show Instance (Single)

```
GET /api/v0/instances/{id}/
```

**Response `200`:** Single instance object with full details.

---

### 2.4 Manage Instance (Start/Stop/Label)

```
PUT /api/v0/instances/{id}/
```

**Request Body:**

```jsonc
{
  "state": "stopped",               // "running" | "stopped"
  "label": "My ML Training Job"     // max 1024 chars
}
```

**Response `200`:** `{ "success": true }`

---

### 2.5 Destroy Instance

```
DELETE /api/v0/instances/{id}/
```

**Response `200`:** `{ "success": true }`

---

### 2.6 Reboot Instance

```
PUT /api/v0/instances/reboot/{id}/
```

**Response `200`:** `{ "success": true }`

---

### 2.7 Recycle Instance

```
PUT /api/v0/instances/recycle/{id}/
```

Stops and restarts the instance (fresh container, preserves volume).

**Response `200`:** `{ "success": true }`

---

### 2.8 Execute Command

```
PUT /api/v0/instances/exec/{id}/
```

**Request Body:**

```jsonc
{
  "command": "nvidia-smi"
}
```

**Response `200`:** Command output.

---

### 2.9 Show Logs

```
PUT /api/v0/instances/request_logs/{id}/
```

**Request Body:**

```jsonc
{
  "tail": "100"      // number of log lines
}
```

**Response `200`:** Log content.

---

### 2.10 Change Bid

```
PUT /api/v0/instances/bid_price/{id}/
```

**Request Body:**

```jsonc
{
  "price": 0.25      // new bid $/hr (0.001–128)
}
```

**Response `200`:** `{ "success": true }`

---

### 2.11 Prepay Instance

```
PUT /api/v0/instances/prepay/{id}/
```

**Request Body:**

```jsonc
{
  "amount": 10.0     // USD to prepay
}
```

---

### 2.12 Copy (Data Transfer)

```
PUT /api/v0/instances/copy/{id}/
```

**Request Body:**

```jsonc
{
  "src": "/workspace/data",
  "dst": "s3://bucket/path"
}
```

---

### 2.13 Cancel Copy

```
DELETE /api/v0/instances/copy/{id}/
```

---

### 2.14 Cloud Copy

```
POST /api/v0/cloud_copy/{id}/
```

---

### 2.15 Cancel Sync

```
DELETE /api/v0/cloud_copy/{id}/
```

---

### 2.16 SSH Key Management (Instance Level)

**Attach SSH Key:**
```
POST /api/v0/instances/ssh_key/{id}/
```

**Detach SSH Key:**
```
DELETE /api/v0/instances/ssh_key/{id}/
```

**Show SSH Keys:**
```
GET /api/v0/instances/ssh_keys/{id}/
```

---

## 3. Templates

### 3.1 Create Template

```
POST /api/v0/template/
```

**Request Body:**

```jsonc
{
  // REQUIRED
  "name": "My vLLM Template",
  "image": "vllm/vllm-openai",

  // OPTIONAL
  "tag": "latest",                         // image tag (or include in image field)
  "runtype": "ssh",                        // "ssh" | "jupyter" | "args"
  "ssh_direct": true,                      // enable direct SSH
  "jup_direct": true,                      // enable direct Jupyter
  "env": {                                 // environment variables
    "HF_TOKEN": "hf_xxx",
    "MODEL_ID": "meta-llama/Llama-3.2-3B"
  },
  "onstart": "vllm serve $MODEL_ID",      // startup commands
  "use_jupyter_lab": true,
  "jupyter_dir": "/workspace",
  "recommended_disk_space": 50,            // GB (default: 16)

  // PRIVATE IMAGE AUTH
  "docker_login_repo": "docker.io",
  "docker_login_user": "username",
  "docker_login_pass": "token",

  // MACHINE FILTERS
  "extra_filters": {                       // search filters baked into template
    "gpu_ram": { "gte": 24000 },
    "reliability": { "gte": 0.99 }
  }
}
```

**Response `200`:**

```jsonc
{
  "success": true,
  "msg": "Template Created Successfully! New Template ID: 123456",
  "template": {
    "name": "My vLLM Template",
    "id": 123456,
    "hash_id": "4e17788f74f075dd9aab7d0d4427968f"  // use this for instance creation
  }
}
```

---

### 3.2 Edit Template

```
PUT /api/v0/template/{id}/
```

**Request Body:** Same fields as Create. Only provided fields are updated.

**Response `200`:** `{ "success": true }`

---

### 3.3 Delete Template

```
DELETE /api/v0/template/{id}/
```

**Response `200`:** `{ "success": true }`

---

### 3.4 Search Templates

```
GET /api/v0/template/search/
```

---

## 4. Volumes

Persistent storage that can be attached to instances.

### 4.1 Rent/Create Volume

```
PUT /api/v0/volumes/
```

**Request Body:**

```jsonc
{
  "id": 420,        // REQUIRED — volume offer ID (from search volumes)
  "size": 15         // size in GB (default: 15)
}
```

**Response `200`:**

```jsonc
{
  "success": true,
  "volume_name": "V.20118481"
}
```

---

### 4.2 List Volumes

```
GET /api/v0/volumes/
```

**Response `200`:** Array of volume objects with `id`, `name`, `size`, `status`, etc.

---

### 4.3 Delete Volume

```
DELETE /api/v0/volumes/{id}/
```

**Response `200`:** `{ "success": true }`

---

### 4.4 Search Volumes

```
POST /api/v0/volumes/search/
```

Search for available volume offers.

---

### 4.5 Unlist Volume

```
POST /api/v0/volumes/unlist/{id}/
```

---

## 5. Network Volumes

### 5.1 Search Network Volumes

```
GET /api/v0/network_volumes/
```

---

### 5.2 Add Network Disk

```
POST /api/v0/network_volumes/add_disk/
```

**Request Body:**

```jsonc
{
  "machine_id": 12345,
  "size": 100          // GB
}
```

---

### 5.3 Unlist Network Volume

```
POST /api/v0/network_volumes/unlist/{id}/
```

---

## 6. Serverless

Vast.ai serverless consists of **Endpoints** (routing layer) and **Workergroups** (autoscaling worker pools).

### 6.1 Create Endpoint

```
POST /api/v0/endptjobs/
```

**Request Body:**

```jsonc
{
  "endpoint_name": "my_endpoint",          // name for the endpoint
  "min_load": 50,                          // minimum load threshold (default: 10)
  "target_util": 0.75,                     // target utilization 0–1 (default: 0.9)
  "cold_mult": 2,                          // cold start multiplier (default: 2.5)
  "cold_workers": 5,                       // cold workers to maintain (default: 5)
  "max_workers": 20                        // max worker instances (default: 20)
}
```

**Response `200`:**

```jsonc
{
  "success": true,
  "result": 12345       // endpoint ID
}
```

---

### 6.2 Show Endpoints

```
GET /api/v0/endptjobs/
```

---

### 6.3 Update Endpoint

```
PUT /api/v0/endptjobs/{id}/
```

**Request Body:** Same fields as Create.

---

### 6.4 Delete Endpoint

```
DELETE /api/v0/endptjobs/{id}/
```

---

### 6.5 Create Workergroup

```
POST /api/v0/workergroups/
```

**Request Body:**

```jsonc
{
  // ENDPOINT ASSOCIATION (one required)
  "endpoint_name": "vLLM-Qwen3-8B",       // create or link to endpoint by name
  "endpoint_id": 123,                      // or link by ID

  // TEMPLATE (one required)
  "template_hash": "abc123def456",         // template hash_id
  "template_id": 456,                      // or template numeric ID

  // WORKER SEARCH
  "search_params": "gpu_name=RTX_3090 rentable=true verified=true",  // default: "verified=true rentable=true rented=false"
  "launch_args": "--env VAR=value",        // additional launch args

  // SCALING
  "min_load": 1,                           // min load threshold (default: 1)
  "target_util": 0.9,                      // target GPU utilization (default: 0.9)
  "cold_mult": 3,                          // cold start multiplier (default: 3)
  "cold_workers": 3,                       // cold workers to keep (default: 3)
  "max_workers": 20,                       // max workers (default: 20)
  "test_workers": 3,                       // test workers (default: 3)

  // REQUIREMENTS
  "gpu_ram": 24                            // min GPU RAM in GB (default: 24)
}
```

**Response `200`:**

```jsonc
{
  "success": true,
  "id": 789              // workergroup ID
}
```

---

### 6.6 Show Workergroups

```
GET /api/v0/workergroups/
```

---

### 6.7 Update Workergroup

```
PUT /api/v0/workergroups/{id}/
```

---

### 6.8 Delete Workergroup

```
DELETE /api/v0/workergroups/{id}/
```

---

### 6.9 Workergroup Logs

```
POST /api/v0/workergroups/{id}/logs/
```

---

### 6.10 Workergroup Workers

```
POST /api/v0/workergroups/{id}/workers/
```

---

### 6.11 Endpoint Logs

```
POST /api/v0/endptjobs/{id}/logs/
```

---

### 6.12 Endpoint Workers

```
POST /api/v0/endptjobs/{id}/workers/
```

---

### 6.13 Route (Send Request to Endpoint)

```
POST /api/v0/endptjobs/{id}/route/
```

---

## 7. Machines (Host Management)

For hosts listing their machines on the marketplace.

### 7.1 Show Machines

```
GET /api/v0/machines/
```

---

### 7.2 Show Reports

```
GET /api/v0/machines/reports/
```

---

### 7.3 List Machine (Make Available)

```
PUT /api/v0/machines/list/{id}/
```

---

### 7.4 Unlist Machine

```
PUT /api/v0/machines/unlist/{id}/
```

---

### 7.5 Set Minimum Bid

```
PUT /api/v0/machines/set_min_bid/{id}/
```

**Request Body:**

```jsonc
{
  "min_bid": 0.15     // $/hr minimum bid
}
```

---

### 7.6 Schedule Maintenance

```
PUT /api/v0/machines/schedule_maint/{id}/
```

---

### 7.7 Cancel Maintenance

```
PUT /api/v0/machines/cancel_maint/{id}/
```

---

### 7.8 Cleanup Machine

```
PUT /api/v0/machines/cleanup/{id}/
```

---

### 7.9 Set Default Job

```
PUT /api/v0/machines/set_defjob/{id}/
```

---

### 7.10 Remove Default Job

```
PUT /api/v0/machines/remove_defjob/{id}/
```

---

## 8. Accounts

### 8.1 Show User

```
GET /api/v0/users/current/
```

---

### 8.2 Set User (Update Profile)

```
PUT /api/v0/users/current/
```

---

### 8.3 API Key Management

**Create API Key:**
```
POST /api/v0/api_keys/
```

**Show API Keys:**
```
GET /api/v0/api_keys/
```

**Delete API Key:**
```
DELETE /api/v0/api_keys/{id}/
```

---

### 8.4 SSH Key Management (Account Level)

**Create SSH Key:**
```
POST /api/v0/ssh_keys/
```

**Request Body:**

```jsonc
{
  "public_key": "ssh-ed25519 AAAA... user@host",
  "label": "my-laptop"
}
```

**Show SSH Keys:**
```
GET /api/v0/ssh_keys/
```

**Update SSH Key:**
```
PUT /api/v0/ssh_keys/{id}/
```

**Delete SSH Key:**
```
DELETE /api/v0/ssh_keys/{id}/
```

---

### 8.5 Environment Variables

**Create:**
```
POST /api/v0/env_vars/
```

**Request Body:**

```jsonc
{
  "key": "HF_TOKEN",
  "value": "hf_xxxxx"
}
```

**Show:**
```
GET /api/v0/env_vars/
```

**Update:**
```
PUT /api/v0/env_vars/{id}/
```

**Delete:**
```
DELETE /api/v0/env_vars/{id}/
```

---

### 8.6 Other Account Endpoints

**Show Connections:** `GET /api/v0/users/connections/`
**Show IP Addresses:** `GET /api/v0/users/ipaddrs/`
**Show Subaccounts:** `GET /api/v0/users/subaccounts/`
**Create Subaccount:** `POST /api/v0/users/subaccounts/`
**Transfer Credit:** `POST /api/v0/users/transfer_credit/`

---

## 9. Team

### 9.1 Create Team

```
POST /api/v0/teams/
```

### 9.2 Delete Team

```
DELETE /api/v0/teams/{id}/
```

### 9.3 Show Team Members

```
GET /api/v0/teams/members/
```

### 9.4 Invite Team Member

```
POST /api/v0/teams/members/
```

### 9.5 Remove Team Member

```
DELETE /api/v0/teams/members/{id}/
```

### 9.6 Team Roles

**Show Roles:** `GET /api/v0/teams/roles/`
**Show Role:** `GET /api/v0/teams/roles/{id}/`
**Create Role:** `POST /api/v0/teams/roles/`
**Update Role:** `PUT /api/v0/teams/roles/{id}/`
**Remove Role:** `DELETE /api/v0/teams/roles/{id}/`

---

## 10. Billing

### 10.1 Show Invoices

```
GET /api/v1/invoices/
```

**Query Parameters (JSON-encoded):**

```jsonc
{
  "select_filters": {
    "when": {
      "gte": 1748736000,                  // REQUIRED — unix epoch start
      "lte": 1764547200                   // REQUIRED — unix epoch end
    },
    "service": {                           // OPTIONAL — filter by service
      "in": ["stripe_payments", "transfer"]
      // services: transfer, stripe_payments, bitpay, coinbase,
      //           crypto.com, instance_prepay, paypal_manual, wise_manual
    }
  },
  "latest_first": true,
  "order_by": [{ "col": "paid_on", "dir": "desc" }],
  "limit": 60,
  "after_token": null                      // pagination token from previous response
}
```

**Response `200`:**

```jsonc
{
  "success": true,
  "count": 2,
  "total": 42,
  "results": [
    {
      "start": 1762149123,                // unix timestamp
      "end": null,
      "type": "transfer",
      "source": "sender@vast.ai",
      "description": "Received credit from sender@vast.ai",
      "amount": 35.5,                     // USD (positive = credit, negative = charge)
      "metadata": {
        "invoice_id": 4829137,
        "service": "transfer",
        "sender": 123456,
        "recipient": 789012
      },
      "items": []
    }
  ],
  "next_token": null                      // pass as after_token for next page
}
```

---

### 10.2 Search Invoices

```
GET /api/v0/invoices/search/
```

---

### 10.3 Show Deposit

```
GET /api/v0/users/deposit/
```

Returns current account balance/deposit info.

---

### 10.4 Show Earnings

```
GET /api/v0/users/earnings/
```

Returns host earnings data.

---

## 11. Filter Operators

All search endpoints use the same filter object syntax:

| Operator | Meaning | Example |
|----------|---------|---------|
| `eq` | Equal to | `{ "eq": true }` |
| `neq` | Not equal to | `{ "neq": false }` |
| `gt` | Greater than | `{ "gt": 0.99 }` |
| `lt` | Less than | `{ "lt": 10000 }` |
| `gte` | Greater than or equal | `{ "gte": 4 }` |
| `lte` | Less than or equal | `{ "lte": 8 }` |
| `in` | Value in list | `{ "in": ["RTX 4090", "RTX 3090"] }` |
| `notin` | Value not in list | `{ "notin": ["TW", "SE"] }` |

---

## 12. Instance Creation Guide

### Workflow

1. **Search offers:** `POST /api/v0/bundles/` with filters
2. **Pick an offer:** Extract `id` from results
3. **Create instance:** `PUT /api/v0/asks/{offer_id}/` with config
4. **Monitor:** `GET /api/v0/instances/{instance_id}/` — check `actual_status`
5. **Manage:** Start/stop/destroy as needed

### Template Precedence

When using `template_hash_id`, request body values override template defaults:
- **Scalar fields** (image, disk, runtype): request wins
- **`env`**: merged by key, request wins on conflicts
- **`extra_filters`**: merged by key, request wins on conflicts

### Important Notes

- `env` in instance creation is a **JSON object** (dict), not Docker flag string
- Port mappings use `"-p HOST:CONTAINER": "1"` syntax inside `env`
- SSH/Jupyter runtypes replace the image entrypoint — use `onstart` for your commands
- `args` runtype preserves the original entrypoint
- Environment variables are NOT visible in SSH sessions unless you add `env >> /etc/environment` to `onstart`
- Offers are dynamic — handle `410 Gone` by retrying with fresh search
- Use `cancel_unavail: true` to fail fast if offer disappears

---

## 13. Permissions Reference

API keys have granular permissions:

| Category | Description |
|----------|-------------|
| `instance_read` | View instances, logs, SSH keys, volumes, deposits |
| `instance_write` | Create/manage/destroy instances, volumes, SSH keys |
| `user_read` | View account info, API keys, SSH keys, templates |
| `user_write` | Manage API keys, SSH keys, env vars, templates, teams |
| `billing_read` | View invoices, earnings |
| `billing_write` | Transfer credits |
| `machine_read` | View machines, reports |
| `machine_write` | List/unlist machines, maintenance, network volumes |
| `misc` | Search offers, network volumes, serverless operations |
| `team_read` | View team members, roles |
| `team_write` | Invite/remove members, manage roles |

---

## 14. TypeScript Helper

```typescript
const VAST_BASE = "https://console.vast.ai";

async function vast<T>(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(`${VAST_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.VAST_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429) {
    throw new Error(`Vast.ai rate limited on ${method} ${path}`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vast.ai ${method} ${path} failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Search for GPU offers ──
const offers = await vast("POST", "/api/v0/bundles/", {
  gpu_name: { in: ["RTX 4090"] },
  num_gpus: { gte: 1 },
  gpu_ram: { gte: 24000 },
  reliability: { gte: 0.99 },
  verified: { eq: true },
  rentable: { eq: true },
  type: "ondemand",
  limit: 5,
});

// ── Create instance from offer ──
const offerId = offers.offers[0].id;
const instance = await vast("PUT", `/api/v0/asks/${offerId}/`, {
  image: "vllm/vllm-openai:latest",
  label: "inference-server",
  disk: 50,
  runtype: "ssh_direct",
  env: {
    MODEL_ID: "meta-llama/Llama-3.2-3B",
    "-p 8000:8000": "1",
  },
  onstart: "vllm serve $MODEL_ID --port 8000",
});
const instanceId = instance.new_contract;

// ── Check instance status ──
const status = await vast("GET", `/api/v0/instances/${instanceId}/`);

// ── Stop instance ──
await vast("PUT", `/api/v0/instances/${instanceId}/`, {
  state: "stopped",
});

// ── Start instance ──
await vast("PUT", `/api/v0/instances/${instanceId}/`, {
  state: "running",
});

// ── Destroy instance ──
await vast("DELETE", `/api/v0/instances/${instanceId}/`);

// ── Create template ──
const template = await vast("POST", "/api/v0/template/", {
  name: "vLLM Inference",
  image: "vllm/vllm-openai",
  tag: "latest",
  runtype: "ssh",
  ssh_direct: true,
  env: { MODEL_ID: "meta-llama/Llama-3.2-3B" },
  onstart: "vllm serve $MODEL_ID --port 8000",
  recommended_disk_space: 50,
});

// ── Create instance from template ──
await vast("PUT", `/api/v0/asks/${offerId}/`, {
  template_hash_id: template.template.hash_id,
  disk: 100,
});

// ── Rent a volume ──
const vol = await vast("PUT", "/api/v0/volumes/", {
  id: 420,  // volume offer ID from search
  size: 50,
});

// ── Create serverless endpoint + workergroup ──
const endpoint = await vast("POST", "/api/v0/endptjobs/", {
  endpoint_name: "my-inference",
  max_workers: 10,
  target_util: 0.85,
});

const workergroup = await vast("POST", "/api/v0/workergroups/", {
  endpoint_id: endpoint.result,
  template_hash: template.template.hash_id,
  search_params: "gpu_name=RTX_4090 rentable=true verified=true",
  max_workers: 10,
  gpu_ram: 24,
});

// ── Get billing ──
const invoices = await vast("GET",
  `/api/v1/invoices/?select_filters=${encodeURIComponent(
    JSON.stringify({ when: { gte: 1704067200, lte: 1735689599 } })
  )}&limit=60`
);
```

---

## Quick Reference: All Endpoints

| Method | Path | Description |
|--------|------|-------------|
| **Search** | | |
| `POST` | `/api/v0/bundles/` | Search GPU offers |
| `GET` | `/api/v0/template/search/` | Search templates |
| `GET` | `/api/v0/benchmarks/` | Search benchmarks |
| **Instances** | | |
| `PUT` | `/api/v0/asks/{offer_id}/` | Create instance |
| `GET` | `/api/v0/instances/` | List all instances |
| `GET` | `/api/v0/instances/{id}/` | Get instance by ID |
| `PUT` | `/api/v0/instances/{id}/` | Manage (start/stop/label) |
| `DELETE` | `/api/v0/instances/{id}/` | Destroy instance |
| `PUT` | `/api/v0/instances/reboot/{id}/` | Reboot instance |
| `PUT` | `/api/v0/instances/recycle/{id}/` | Recycle instance |
| `PUT` | `/api/v0/instances/exec/{id}/` | Execute command |
| `PUT` | `/api/v0/instances/request_logs/{id}/` | Get logs |
| `PUT` | `/api/v0/instances/bid_price/{id}/` | Change bid price |
| `PUT` | `/api/v0/instances/prepay/{id}/` | Prepay instance |
| `PUT` | `/api/v0/instances/copy/{id}/` | Start data copy |
| `DELETE` | `/api/v0/instances/copy/{id}/` | Cancel copy |
| `POST` | `/api/v0/cloud_copy/{id}/` | Cloud copy |
| `DELETE` | `/api/v0/cloud_copy/{id}/` | Cancel sync |
| `POST` | `/api/v0/instances/ssh_key/{id}/` | Attach SSH key |
| `DELETE` | `/api/v0/instances/ssh_key/{id}/` | Detach SSH key |
| `GET` | `/api/v0/instances/ssh_keys/{id}/` | Show SSH keys |
| **Templates** | | |
| `POST` | `/api/v0/template/` | Create template |
| `PUT` | `/api/v0/template/{id}/` | Edit template |
| `DELETE` | `/api/v0/template/{id}/` | Delete template |
| **Volumes** | | |
| `GET` | `/api/v0/volumes/` | List volumes |
| `PUT` | `/api/v0/volumes/` | Rent/create volume |
| `DELETE` | `/api/v0/volumes/{id}/` | Delete volume |
| `POST` | `/api/v0/volumes/search/` | Search volume offers |
| `POST` | `/api/v0/volumes/unlist/{id}/` | Unlist volume |
| **Network Volumes** | | |
| `GET` | `/api/v0/network_volumes/` | Search network volumes |
| `POST` | `/api/v0/network_volumes/add_disk/` | Add network disk |
| `POST` | `/api/v0/network_volumes/unlist/{id}/` | Unlist network volume |
| **Serverless** | | |
| `POST` | `/api/v0/endptjobs/` | Create endpoint |
| `GET` | `/api/v0/endptjobs/` | Show endpoints |
| `PUT` | `/api/v0/endptjobs/{id}/` | Update endpoint |
| `DELETE` | `/api/v0/endptjobs/{id}/` | Delete endpoint |
| `POST` | `/api/v0/endptjobs/{id}/logs/` | Endpoint logs |
| `POST` | `/api/v0/endptjobs/{id}/workers/` | Endpoint workers |
| `POST` | `/api/v0/workergroups/` | Create workergroup |
| `GET` | `/api/v0/workergroups/` | Show workergroups |
| `PUT` | `/api/v0/workergroups/{id}/` | Update workergroup |
| `DELETE` | `/api/v0/workergroups/{id}/` | Delete workergroup |
| `POST` | `/api/v0/workergroups/{id}/logs/` | Workergroup logs |
| `POST` | `/api/v0/workergroups/{id}/workers/` | Workergroup workers |
| `POST` | `/api/v0/endptjobs/{id}/route/` | Route request to endpoint |
| **Machines** | | |
| `GET` | `/api/v0/machines/` | Show machines |
| `GET` | `/api/v0/machines/reports/` | Show reports |
| `PUT` | `/api/v0/machines/list/{id}/` | List machine |
| `PUT` | `/api/v0/machines/unlist/{id}/` | Unlist machine |
| `PUT` | `/api/v0/machines/set_min_bid/{id}/` | Set min bid |
| `PUT` | `/api/v0/machines/schedule_maint/{id}/` | Schedule maintenance |
| `PUT` | `/api/v0/machines/cancel_maint/{id}/` | Cancel maintenance |
| `PUT` | `/api/v0/machines/cleanup/{id}/` | Cleanup machine |
| `PUT` | `/api/v0/machines/set_defjob/{id}/` | Set default job |
| `PUT` | `/api/v0/machines/remove_defjob/{id}/` | Remove default job |
| **Accounts** | | |
| `GET` | `/api/v0/users/current/` | Show user |
| `PUT` | `/api/v0/users/current/` | Update user |
| `POST` | `/api/v0/api_keys/` | Create API key |
| `GET` | `/api/v0/api_keys/` | List API keys |
| `DELETE` | `/api/v0/api_keys/{id}/` | Delete API key |
| `POST` | `/api/v0/ssh_keys/` | Create SSH key |
| `GET` | `/api/v0/ssh_keys/` | List SSH keys |
| `PUT` | `/api/v0/ssh_keys/{id}/` | Update SSH key |
| `DELETE` | `/api/v0/ssh_keys/{id}/` | Delete SSH key |
| `POST` | `/api/v0/env_vars/` | Create env var |
| `GET` | `/api/v0/env_vars/` | List env vars |
| `PUT` | `/api/v0/env_vars/{id}/` | Update env var |
| `DELETE` | `/api/v0/env_vars/{id}/` | Delete env var |
| `GET` | `/api/v0/users/connections/` | Show connections |
| `GET` | `/api/v0/users/ipaddrs/` | Show IP addresses |
| `GET` | `/api/v0/users/subaccounts/` | Show subaccounts |
| `POST` | `/api/v0/users/subaccounts/` | Create subaccount |
| `POST` | `/api/v0/users/transfer_credit/` | Transfer credit |
| **Team** | | |
| `POST` | `/api/v0/teams/` | Create team |
| `DELETE` | `/api/v0/teams/{id}/` | Delete team |
| `GET` | `/api/v0/teams/members/` | Show members |
| `POST` | `/api/v0/teams/members/` | Invite member |
| `DELETE` | `/api/v0/teams/members/{id}/` | Remove member |
| `GET` | `/api/v0/teams/roles/` | List roles |
| `GET` | `/api/v0/teams/roles/{id}/` | Show role |
| `POST` | `/api/v0/teams/roles/` | Create role |
| `PUT` | `/api/v0/teams/roles/{id}/` | Update role |
| `DELETE` | `/api/v0/teams/roles/{id}/` | Remove role |
| **Billing** | | |
| `GET` | `/api/v1/invoices/` | Show invoices |
| `GET` | `/api/v0/invoices/search/` | Search invoices |
| `GET` | `/api/v0/users/deposit/` | Show deposit/balance |
| `GET` | `/api/v0/users/earnings/` | Show earnings |
