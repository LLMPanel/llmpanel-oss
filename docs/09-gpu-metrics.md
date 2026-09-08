# GPU Metrics

## Overview

LLMPanel provides real-time GPU monitoring for deployments. The metrics system detects single and multi-GPU setups automatically and displays per-GPU detailed information alongside aggregated system-level metrics.

## Architecture

```
nvidia-smi (container) → Provider.getMetrics() → API Controller → Frontend Hook → UI Components
```

### Data Flow

1. **Collection**: `nvidia-smi` runs inside the deployment container, querying 19 GPU metrics fields
2. **Parsing**: The local provider parses CSV output, handles `[N/A]` values, and builds per-GPU objects
3. **API**: `GET /api/v1/metrics/deployments/:id` returns both aggregated and per-GPU metrics
4. **Frontend**: `useGpuMetrics` hook polls every 5 seconds when deployment is running
5. **Display**: Metrics page renders overview cards, comparison bars (multi-GPU), and per-GPU detail cards

## API

### `GET /api/v1/metrics/deployments/:id`

Returns live GPU metrics from the provider plus request stats from the database.

**Response:**

```json
{
  "metrics": {
    "gpuCount": 4,
    "gpuUtilization": 85,
    "vramUsedGb": 120.5,
    "vramTotalGb": 160.0,
    "vramUsedPercent": 75,
    "temperatureCelsius": 72,
    "powerDrawWatts": 1200,
    "gpus": [
      {
        "index": 0,
        "name": "NVIDIA H100 80GB HBM3",
        "uuid": "GPU-abc123...",
        "gpuUtilization": 87,
        "memoryUtilization": 65,
        "vramUsedGb": 30.2,
        "vramTotalGb": 40.0,
        "vramFreeGb": 9.8,
        "temperatureCelsius": 71,
        "temperatureMemoryCelsius": 68,
        "fanSpeedPercent": null,
        "powerDrawWatts": 300,
        "powerLimitWatts": 350,
        "clockGraphicsMhz": 1980,
        "clockMemoryMhz": 2619,
        "clockSmMhz": 1980,
        "pcieGen": 5,
        "pcieLinkWidth": 16,
        "eccErrors": 0
      }
    ],
    "requestsPerMinute": 42,
    "averageLatencyMs": 156,
    "tokensLastFiveMinutes": 28000
  }
}
```

## Per-GPU Metrics Collected

| Metric | Field | Unit | Source |
|--------|-------|------|--------|
| GPU Index | `index` | - | `nvidia-smi` |
| GPU Name | `name` | - | `nvidia-smi` |
| UUID | `uuid` | - | `nvidia-smi` |
| GPU Utilization | `gpuUtilization` | % | `utilization.gpu` |
| Memory Bandwidth Utilization | `memoryUtilization` | % | `utilization.memory` |
| VRAM Used | `vramUsedGb` | GB | `memory.used` |
| VRAM Total | `vramTotalGb` | GB | `memory.total` |
| VRAM Free | `vramFreeGb` | GB | `memory.free` |
| GPU Temperature | `temperatureCelsius` | °C | `temperature.gpu` |
| Memory Temperature | `temperatureMemoryCelsius` | °C | `temperature.memory` |
| Fan Speed | `fanSpeedPercent` | % | `fan.speed` |
| Power Draw | `powerDrawWatts` | W | `power.draw` |
| Power Limit | `powerLimitWatts` | W | `power.limit` |
| Graphics Clock | `clockGraphicsMhz` | MHz | `clocks.current.graphics` |
| Memory Clock | `clockMemoryMhz` | MHz | `clocks.current.memory` |
| SM Clock | `clockSmMhz` | MHz | `clocks.current.sm` |
| PCIe Generation | `pcieGen` | - | `pcie.link.gen.current` |
| PCIe Link Width | `pcieLinkWidth` | lanes | `pcie.link.width.current` |
| ECC Errors | `eccErrors` | count | `ecc.errors.corrected.volatile.total` |

## Provider Support

| Provider | GPU Metrics | Per-GPU Breakdown |
|----------|------------|-------------------|
| Local (Docker) | Full | Yes — via `nvidia-smi` inside container |
| RunPod | No (stubs) | No — API doesn't expose metrics |
| Vast.ai | No (stubs) | No — API doesn't expose metrics |

## Frontend Components

All components are in `apps/web/components/metrics/`:

| Component | File | Description |
|-----------|------|-------------|
| `MetricsHeader` | `metrics-header.tsx` | Back button, title, GPU count badge, deployment info badges |
| `MetricsOverviewCards` | `metrics-overview-cards.tsx` | 6-column grid of summary stat cards with progress bars |
| `GpuSystemInfo` | `gpu-system-info.tsx` | Aggregated system stats (total VRAM, power, temp range, PCIe, ECC) |
| `GpuComparisonBars` | `gpu-comparison-bars.tsx` | Side-by-side comparison bars for multi-GPU (utilization, VRAM, temp, power) |
| `GpuDeviceCard` | `gpu-device-card.tsx` | Individual GPU card with all 19 metrics, progress bars, and detail grid |
| `MetricsNotAvailable` | `metrics-not-available.tsx` | Fallback state for cloud providers or non-running deployments |

## Multi-GPU Detection

The system automatically detects GPU count from `nvidia-smi` output (one line per GPU). When multiple GPUs are present:

- **Overview cards** show averaged/summed values across all GPUs
- **Comparison bars** render side-by-side progress bars for quick visual comparison
- **Individual GPU cards** display in a 2-column grid with full detail per device
- **System info card** shows aggregated totals (total VRAM, total power, temp range)

For single GPU setups, the comparison bars are hidden and the GPU card renders full-width.

## Key Files

```
packages/providers/src/types.ts                   — SingleGPUMetricsSchema, GPUMetricsSchema
packages/providers/src/local/local.provider.ts     — nvidia-smi query (19 fields)
apps/api/src/controllers/metrics.controller.ts     — API endpoint returning per-GPU data
apps/web/hooks/use-gpu-metrics.ts                  — Polling hook (5s interval)
apps/web/app/dashboard/deployments/[id]/metrics/   — Metrics page
apps/web/components/metrics/                       — All metric UI components
```
