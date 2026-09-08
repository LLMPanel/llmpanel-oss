// Live per-provider stats fetchers (instances, burn rate, balance).
//
// Shared by the `/providers/:id/stats` endpoint and the background spend
// snapshot collector — the provider HTTP calls live here so both consumers
// see identical numbers.

import {
  DataCrunchClient,
  hyperstackRequest,
  isPubliclyRoutableIp,
  runpodRestV2,
  tensordockRequest,
} from "@llmpanel/providers"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProviderInstance {
  id: string
  name: string
  gpuName: string
  gpuCount: number
  status: string
  costPerHour: number
  uptimeMinutes: number | null
  publicIp: string | null
  datacenter: string | null
}

export interface ProviderStats {
  providerType:
    | "runpod"
    | "vastai"
    | "hotaisle"
    | "lambdalabs"
    | "datacrunch"
    | "hyperstack"
    | "tensordock"
  balance: number | null          // null = not available from API
  balanceCurrency: string
  totalInstances: number
  runningInstances: number
  totalCostPerHour: number
  instances: ProviderInstance[]
}

const FETCH_TIMEOUT_MS = 10_000

// ── RunPod ────────────────────────────────────────────────────────────────────

interface RunPodPod {
  id: string
  name?: string | null
  status?: string | null
  cost?: number | null
  gpu?: { id?: string | null; count?: number | null } | null
  dataCenterId?: string | null
  startedAt?: string | null
  runtime?: {
    uptime?: number | null
    ports?: Array<{ ip?: string | null }> | null
  } | null
}

interface RunPodMyselfResponse {
  data?: {
    myself?: {
      clientBalance?: number
      currentSpendPerHr?: number
    }
  }
}

// The REST API has no balance endpoint, but the GraphQL API exposes it on
// `myself`. Best effort — a failure here must not sink the stats call.
async function fetchRunPodBalance(apiKey: string): Promise<number | null> {
  try {
    const res = await fetch("https://api.runpod.io/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: "query { myself { clientBalance currentSpendPerHr } }",
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = (await res.json()) as RunPodMyselfResponse
    const balance = data.data?.myself?.clientBalance
    return typeof balance === "number" && Number.isFinite(balance) ? balance : null
  } catch {
    return null
  }
}

export async function fetchRunPodStats(apiKey: string): Promise<ProviderStats> {
  const [podsData, balance] = await Promise.all([
    runpodRestV2<{ pods?: RunPodPod[] }>(apiKey, "GET", "/v2/pods"),
    fetchRunPodBalance(apiKey),
  ])
  const pods = podsData.pods ?? []

  const instances: ProviderInstance[] = pods.map((pod) => {
    const status = (pod.status ?? "UNKNOWN").toLowerCase()

    // v2 reports live uptime directly; startedAt is the fallback for a pod
    // that is running but has no runtime block yet.
    const uptimeSeconds =
      pod.runtime?.uptime ??
      (pod.startedAt && status === "running"
        ? Math.floor((Date.now() - new Date(pod.startedAt).getTime()) / 1000)
        : null)

    // Every address v2 reports for a proxy pod is CGNAT (100.64/10) — showing
    // one as the instance's IP would be actively wrong.
    const routableIp =
      (pod.runtime?.ports ?? []).map((p) => p.ip ?? null).find(isPubliclyRoutableIp) ?? null

    return {
      id: pod.id,
      name: pod.name ?? pod.id,
      gpuName: pod.gpu?.id ?? "Unknown GPU",
      gpuCount: pod.gpu?.count ?? 1,
      status,
      costPerHour: pod.cost ?? 0,
      uptimeMinutes: uptimeSeconds != null ? Math.floor(uptimeSeconds / 60) : null,
      publicIp: routableIp,
      datacenter: pod.dataCenterId ?? null,
    }
  })

  const running = instances.filter((i) => i.status === "running")
  const totalCostPerHour = running.reduce((sum, i) => sum + i.costPerHour, 0)

  return {
    providerType: "runpod",
    balance,
    balanceCurrency: "USD",
    totalInstances: instances.length,
    runningInstances: running.length,
    totalCostPerHour,
    instances,
  }
}

// ── Vast.ai ───────────────────────────────────────────────────────────────────

interface VastInstance {
  id: number
  label?: string
  gpu_name?: string
  num_gpus?: number
  cur_state?: string
  actual_status?: string
  dph_total?: number
  uptime_mins?: number
  public_ipaddr?: string
  datacenter?: string
  machine_dir?: string
}

interface VastUser {
  id?: number
  balance?: number
  credit?: number
  current?: {
    balance?: number
    credit?: number
  }
  users?: Array<{
    balance?: number
    credit?: number
  }>
  email?: string
}

interface VastEarnings {
  current?: {
    balance?: number
    credit?: number
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function getBalanceFromVastUser(userData: VastUser): number | null {
  const candidates: unknown[] = [
    userData.balance,
    userData.credit,
    userData.current?.balance,
    userData.current?.credit,
    userData.users?.[0]?.balance,
    userData.users?.[0]?.credit,
  ]

  for (const candidate of candidates) {
    const parsed = toFiniteNumber(candidate)
    if (parsed != null) return parsed
  }

  return null
}

function getBalanceFromEarnings(data: VastEarnings): number | null {
  return toFiniteNumber(data.current?.credit) ?? toFiniteNumber(data.current?.balance)
}

export async function fetchVastAiStats(apiKey: string): Promise<ProviderStats> {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  }
  const baseUrl = "https://console.vast.ai"

  const [userRes, instancesRes] = await Promise.all([
    fetch(`${baseUrl}/api/v0/users/current/`, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
    fetch(`${baseUrl}/api/v0/instances/`, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
  ])

  if (!userRes.ok) {
    throw new Error(`Vast.ai API error: ${userRes.status} ${userRes.statusText}`)
  }

  const userData = (await userRes.json()) as VastUser
  let resolvedBalance = getBalanceFromVastUser(userData)

  // Fallback for keys/accounts where billing fields are only exposed in machine-earnings
  if (userData.id && (resolvedBalance == null || resolvedBalance <= 0)) {
    try {
      const earningsRes = await fetch(
        `${baseUrl}/api/v0/users/${userData.id}/machine-earnings/`,
        { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }
      )
      if (earningsRes.ok) {
        const earningsData = (await earningsRes.json()) as VastEarnings
        const fallbackBalance = getBalanceFromEarnings(earningsData)
        const currentBalance = resolvedBalance ?? Number.NEGATIVE_INFINITY
        if (fallbackBalance != null && fallbackBalance > currentBalance) {
          resolvedBalance = fallbackBalance
        }
      }
    } catch {
      // Best effort fallback only; don't fail stats endpoint if this call errors
    }
  }

  const instancesData = instancesRes.ok
    ? (await instancesRes.json()) as { instances?: VastInstance[] }
    : { instances: [] }

  const rawInstances = instancesData.instances ?? []

  const instances: ProviderInstance[] = rawInstances.map((inst) => ({
    id: String(inst.id),
    name: inst.label ?? `Instance ${inst.id}`,
    gpuName: inst.gpu_name ?? "Unknown GPU",
    gpuCount: inst.num_gpus ?? 1,
    status: inst.actual_status ?? inst.cur_state ?? "unknown",
    costPerHour: inst.dph_total ?? 0,
    uptimeMinutes: inst.uptime_mins ?? null,
    publicIp: inst.public_ipaddr ?? null,
    datacenter: inst.machine_dir ?? null,
  }))

  const running = instances.filter((i) =>
    ["running", "online"].includes(i.status.toLowerCase())
  )
  const totalCostPerHour = running.reduce((sum, i) => sum + i.costPerHour, 0)

  return {
    providerType: "vastai",
    balance: resolvedBalance,
    balanceCurrency: "USD",
    totalInstances: instances.length,
    runningInstances: running.length,
    totalCostPerHour,
    instances,
  }
}

// ── Hot Aisle ─────────────────────────────────────────────────────────────────

interface HotAisleVM {
  name: string
  ip_address: string
  description?: string
  ssh_access: { ip_address: string; port: number; dns_name?: string }
  cpu_cores: number
  ram_capacity: number
  disk_capacity: number
  gpus?: Array<{ count: number; manufacturer: string; model: string }>
}

export async function fetchHotAisleStats(apiKey: string): Promise<ProviderStats> {
  // API key format: "key:team"
  let actualKey = apiKey
  let teamHandle = "default"
  if (apiKey.includes(":")) {
    const parts = apiKey.split(":", 2)
    actualKey = parts[0]
    teamHandle = parts[1]
  }

  const headers = {
    Authorization: `Api-Key ${actualKey}`,
    Accept: "application/json",
  }
  const baseUrl = "https://admin.hotaisle.app/api"

  const vmsRes = await fetch(`${baseUrl}/teams/${teamHandle}/virtual_machines/`, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!vmsRes.ok) {
    throw new Error(`Hot Aisle API error: ${vmsRes.status} ${vmsRes.statusText}`)
  }

  const vms = (await vmsRes.json()) as HotAisleVM[]

  const instances: ProviderInstance[] = vms.map((vm) => {
    const gpuName = vm.gpus?.[0]
      ? `${vm.gpus[0].manufacturer} ${vm.gpus[0].model}`
      : "CPU Only"
    const gpuCount = vm.gpus?.reduce((sum, g) => sum + g.count, 0) ?? 0

    return {
      id: vm.name,
      name: vm.description ?? vm.name,
      gpuName,
      gpuCount,
      status: vm.ip_address ? "running" : "provisioning",
      costPerHour: 0, // pricing is on available types, not individual VMs
      uptimeMinutes: null,
      publicIp: vm.ip_address ?? null,
      datacenter: null,
    }
  })

  const running = instances.filter((i) => i.status === "running")

  return {
    providerType: "hotaisle" as ProviderStats["providerType"],
    balance: null,
    balanceCurrency: "USD",
    totalInstances: instances.length,
    runningInstances: running.length,
    totalCostPerHour: 0,
    instances,
  }
}

// ── Lambda Cloud ──────────────────────────────────────────────────────────────

interface LambdaStatsInstance {
  id: string
  name?: string | null
  ip?: string | null
  status: string
  region: { name: string; description: string }
  instance_type: {
    name: string
    description: string
    gpu_description: string
    price_cents_per_hour: number
    specs: { gpus: number }
  }
}

export async function fetchLambdaLabsStats(apiKey: string): Promise<ProviderStats> {
  const res = await fetch("https://cloud.lambda.ai/api/v1/instances", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(`Lambda Cloud API error: ${res.status} ${res.statusText}`)
  }

  const body = (await res.json()) as { data: LambdaStatsInstance[] }

  const instances: ProviderInstance[] = body.data.map((inst) => {
    const billing = inst.status !== "terminated" && inst.status !== "terminating"
    return {
      id: inst.id,
      name: inst.name ?? inst.id,
      gpuName: inst.instance_type.gpu_description,
      gpuCount: inst.instance_type.specs.gpus,
      status: inst.status,
      // Lambda bills from launch (post health check) until terminate — booting
      // instances are already paying customers, so count them.
      costPerHour: billing ? inst.instance_type.price_cents_per_hour / 100 : 0,
      uptimeMinutes: null, // launch time is not exposed by the API
      publicIp: inst.ip ?? null,
      datacenter: inst.region.name,
    }
  })

  const running = instances.filter((i) => i.status === "active")

  return {
    providerType: "lambdalabs",
    balance: null, // no billing/balance endpoint in the Cloud API
    balanceCurrency: "USD",
    totalInstances: instances.length,
    runningInstances: running.length,
    totalCostPerHour: instances.reduce((sum, i) => sum + i.costPerHour, 0),
    instances,
  }
}

// ── DataCrunch ────────────────────────────────────────────────────────────────

interface DCStatsInstance {
  id: string
  hostname: string
  description: string
  ip: string | null
  status: string
  location: string
  price_per_hour: number
  instance_type: string
  gpu: { description: string; number_of_gpus: number }
}

export async function fetchDataCrunchStats(apiKey: string): Promise<ProviderStats> {
  const client = new DataCrunchClient(apiKey)

  const [instancesRes, balanceRes] = await Promise.allSettled([
    client.request<DCStatsInstance[]>("GET", "/instances"),
    client.request<{ amount: number; currency: string }>("GET", "/balance"),
  ])

  if (instancesRes.status === "rejected") {
    throw instancesRes.reason instanceof Error
      ? instancesRes.reason
      : new Error(String(instancesRes.reason))
  }

  const instances: ProviderInstance[] = instancesRes.value.map((inst) => {
    // `offline` instances are shut down but DataCrunch keeps billing them at
    // the full rate, so they still count toward burn.
    const billing = !["deleting", "discontinued", "error"].includes(inst.status)
    return {
      id: inst.id,
      name: inst.hostname || inst.description || inst.id,
      gpuName: inst.gpu?.description ?? inst.instance_type,
      gpuCount: inst.gpu?.number_of_gpus ?? 0,
      status: inst.status,
      costPerHour: billing ? inst.price_per_hour : 0,
      uptimeMinutes: null,
      publicIp: inst.ip,
      datacenter: inst.location,
    }
  })

  const running = instances.filter((i) => i.status === "running")
  const balance =
    balanceRes.status === "fulfilled" ? (balanceRes.value.amount ?? null) : null

  return {
    providerType: "datacrunch",
    balance,
    balanceCurrency:
      balanceRes.status === "fulfilled"
        ? (balanceRes.value.currency ?? "USD").toUpperCase()
        : "USD",
    totalInstances: instances.length,
    runningInstances: running.length,
    totalCostPerHour: instances.reduce((sum, i) => sum + i.costPerHour, 0),
    instances,
  }
}

// ── Hyperstack ────────────────────────────────────────────────────────────────

interface HSStatsInstance {
  id: number
  name: string
  status: string
  fixed_ip: string | null
  floating_ip: string | null
  environment?: { name: string; region: string }
  flavor?: { name: string; gpu: string; gpu_count: number }
}

export async function fetchHyperstackStats(apiKey: string): Promise<ProviderStats> {
  const [vmsRes, creditRes, priceRes] = await Promise.allSettled([
    hyperstackRequest<{ instances: HSStatsInstance[] }>(apiKey, "GET", "/core/virtual-machines"),
    hyperstackRequest<{ data: { credit: number } }>(apiKey, "GET", "/billing/user-credit/credit"),
    hyperstackRequest<Array<{ name: string; value: string }>>(apiKey, "GET", "/pricebook"),
  ])

  if (vmsRes.status === "rejected") {
    throw vmsRes.reason instanceof Error ? vmsRes.reason : new Error(String(vmsRes.reason))
  }

  // Per-GPU hourly rates keyed by GPU model name; values are strings and may
  // be in scientific notation ("0E-9").
  const prices = new Map<string, number>()
  if (priceRes.status === "fulfilled") {
    for (const entry of priceRes.value) {
      const value = Number(entry.value)
      if (Number.isFinite(value)) prices.set(entry.name, value)
    }
  }

  const instances: ProviderInstance[] = vmsRes.value.instances.map((vm) => {
    const gpuCount = vm.flavor?.gpu_count ?? 0
    const perGpu = prices.get(vm.flavor?.gpu ?? "")
    const status = vm.status.toUpperCase()
    // A SHUTOFF VM keeps its full flavor reservation on Hyperstack and is
    // billed at the running rate; hibernation is the only state that
    // deallocates the GPUs. So SHUTOFF counts toward burn and HIBERNATED
    // does not (its residual root-disk/IP cost isn't exposed per-VM).
    const billing = ![
      "DELETING",
      "DELETED",
      "ERROR",
      "HIBERNATED",
      "HIBERNATING",
      "RESTORING",
    ].includes(status)
    const ip = vm.floating_ip?.trim() || null

    return {
      id: String(vm.id),
      name: vm.name,
      gpuName: vm.flavor?.gpu || vm.flavor?.name || "GPU",
      gpuCount,
      status: vm.status,
      costPerHour: billing && perGpu != null ? perGpu * gpuCount : 0,
      uptimeMinutes: null,
      publicIp: ip,
      datacenter: vm.environment?.region ?? null,
    }
  })

  const running = instances.filter((i) => i.status.toUpperCase() === "ACTIVE")

  return {
    providerType: "hyperstack",
    balance: creditRes.status === "fulfilled" ? (creditRes.value.data?.credit ?? null) : null,
    balanceCurrency: "USD",
    totalInstances: instances.length,
    runningInstances: running.length,
    totalCostPerHour: instances.reduce((sum, i) => sum + i.costPerHour, 0),
    instances,
  }
}

// ── TensorDock ────────────────────────────────────────────────────────────────

interface TDListInstance {
  id: string
  attributes?: { name?: string; status?: string }
}

interface TDDetail {
  id: string
  name: string
  status: string
  ipAddress: string | null
  rateHourly?: number
  resources?: { gpus?: Record<string, { count: number; v0Name: string }> }
}

export async function fetchTensorDockStats(apiKey: string): Promise<ProviderStats> {
  const list = await tensordockRequest<{ data: { instances: TDListInstance[] } }>(
    apiKey,
    "GET",
    "/instances",
  )
  const rows = list.data?.instances ?? []

  // The list response carries only name + status, so IP and cost need a
  // per-instance detail call. Failures degrade to the list-level fields.
  const details = await Promise.all(
    rows.map(async (row) => {
      try {
        return await tensordockRequest<TDDetail>(apiKey, "GET", `/instances/${row.id}`)
      } catch {
        return null
      }
    }),
  )

  const instances: ProviderInstance[] = rows.map((row, i) => {
    const detail = details[i]
    const gpu = Object.values(detail?.resources?.gpus ?? {})[0]
    const status = detail?.status ?? row.attributes?.status ?? "unknown"
    // Stopped instances keep billing for storage, but the API exposes no
    // storage-only rate, so only running instances count toward burn.
    const running = status.toLowerCase() === "running" || status.toLowerCase() === "active"

    return {
      id: row.id,
      name: detail?.name ?? row.attributes?.name ?? row.id,
      gpuName: gpu?.v0Name ?? "GPU",
      gpuCount: gpu?.count ?? 0,
      status,
      costPerHour: running ? (detail?.rateHourly ?? 0) : 0,
      uptimeMinutes: null,
      publicIp: detail?.ipAddress?.trim() || null,
      datacenter: null,
    }
  })

  const running = instances.filter(
    (i) => i.status.toLowerCase() === "running" || i.status.toLowerCase() === "active",
  )

  return {
    providerType: "tensordock",
    // TensorDock's v2 billing endpoints are documented as "Coming Soon".
    balance: null,
    balanceCurrency: "USD",
    totalInstances: instances.length,
    runningInstances: running.length,
    totalCostPerHour: instances.reduce((sum, i) => sum + i.costPerHour, 0),
    instances,
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export const STATS_CAPABLE_PROVIDERS = [
  "runpod",
  "vastai",
  "hotaisle",
  "lambdalabs",
  "datacrunch",
  "hyperstack",
  "tensordock",
] as const

export function isStatsCapableProvider(
  providerType: string,
): providerType is ProviderStats["providerType"] {
  return (STATS_CAPABLE_PROVIDERS as readonly string[]).includes(providerType)
}

export async function fetchStatsForProvider(
  providerType: ProviderStats["providerType"],
  apiKey: string,
): Promise<ProviderStats> {
  if (providerType === "runpod") return fetchRunPodStats(apiKey)
  if (providerType === "vastai") return fetchVastAiStats(apiKey)
  if (providerType === "lambdalabs") return fetchLambdaLabsStats(apiKey)
  if (providerType === "datacrunch") return fetchDataCrunchStats(apiKey)
  if (providerType === "hyperstack") return fetchHyperstackStats(apiKey)
  if (providerType === "tensordock") return fetchTensorDockStats(apiKey)
  return fetchHotAisleStats(apiKey)
}
