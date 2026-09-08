import { Memory } from "mem0ai/oss"

// Cache Memory instances per deployment endpoint
const memoryInstances = new Map<string, Memory>()

export function initMemory(deploymentEndpoint: string): Memory {
  const existing = memoryInstances.get(deploymentEndpoint)
  if (existing) return existing

  const memory = new Memory({
    llm: {
      provider: "openai",
      config: {
        model: "default",
        apiKey: "not-needed",
        baseURL: `${deploymentEndpoint}/v1`,
        // openaiBaseUrl: `${deploymentEndpoint}/v1`,
      },
    },
    embedder: {
      provider: "openai",
      config: {
        model: "default",
        apiKey: "not-needed",
        baseURL: `${deploymentEndpoint}/v1`,
        // openaiBaseUrl: `${deploymentEndpoint}/v1`,
      },
    },
  })

  memoryInstances.set(deploymentEndpoint, memory)
  return memory
}

export async function searchMemories(
  memory: Memory,
  userId: string,
  query: string
): Promise<string[]> {
  try {
    const results = await memory.search(query, { userId })
    if (!results || !Array.isArray(results)) return []
    return results.map((r: { memory?: string }) => r.memory ?? "").filter(Boolean)
  } catch (err) {
    console.error("[MemoryService] searchMemories error:", err)
    return []
  }
}

export async function addMemory(
  memory: Memory,
  userId: string,
  messages: Array<{ role: string; content: string }>
): Promise<void> {
  try {
    await memory.add(messages, { userId })
  } catch (err) {
    console.error("[MemoryService] addMemory error:", err)
  }
}

export async function getMemories(
  memory: Memory,
  userId: string
): Promise<string[]> {
  try {
    const results = await memory.getAll({ userId })
    if (!results || !Array.isArray(results)) return []
    return results.map((r: { memory?: string }) => r.memory ?? "").filter(Boolean)
  } catch (err) {
    console.error("[MemoryService] getMemories error:", err)
    return []
  }
}

export async function deleteUserMemories(
  memory: Memory,
  userId: string
): Promise<void> {
  try {
    await memory.deleteAll({ userId })
  } catch (err) {
    console.error("[MemoryService] deleteUserMemories error:", err)
  }
}

export function removeMemoryInstance(deploymentEndpoint: string): void {
  memoryInstances.delete(deploymentEndpoint)
}
