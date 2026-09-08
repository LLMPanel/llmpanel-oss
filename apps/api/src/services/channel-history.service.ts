// Per-user conversation history for channel connections, backed by the
// channel_messages table. A row with direction "system" acts as a context
// reset marker: history is truncated at the most recent marker.
//
// Ordering note: created_at has second granularity, so consecutive rows often
// tie. All ordering uses SQLite's implicit rowid (monotonic insertion order)
// instead; timestamps are display data only.
import { db } from "@llmpanel/db"
import { channelMessages } from "@llmpanel/db/schema"
import { eq, and, desc, sql } from "drizzle-orm"

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export const RESET_MARKER_CONTENT = "context_cleared"

/**
 * Last-N messages for (channel, user), oldest → newest, truncated at the most
 * recent reset marker.
 */
export async function getConversationHistory(
  channelConnectionId: string,
  platformUserId: string,
  limit: number
): Promise<ChatMessage[]> {
  const rows = await db.query.channelMessages.findMany({
    where: and(
      eq(channelMessages.channelConnectionId, channelConnectionId),
      eq(channelMessages.platformUserId, platformUserId),
    ),
    orderBy: desc(sql`rowid`),
    limit: Math.max(limit, 1),
  })

  const history: ChatMessage[] = []
  for (const row of rows) {
    if (row.direction === "system") break // reset marker — stop collecting
    history.push({
      role: row.direction === "inbound" ? "user" : "assistant",
      content: row.content,
    })
  }
  return history.reverse()
}

/** Insert a reset marker so subsequent history reads start fresh. */
export async function insertResetMarker(
  channelConnectionId: string,
  platformUserId: string,
  platformUsername: string | null
): Promise<void> {
  await db.insert(channelMessages).values({
    id: crypto.randomUUID(),
    channelConnectionId,
    platformUserId,
    platformUsername,
    direction: "system",
    content: RESET_MARKER_CONTENT,
    createdAt: new Date(),
  })
}

/**
 * Log an inbound/outbound exchange. The inbound row is inserted first so
 * rowid order matches conversation order.
 */
export async function logExchange(params: {
  channelConnectionId: string
  platformUserId: string
  platformUsername: string | null
  userText: string
  assistantText: string
  totalTokens: number | null
  /** When the inbound message arrived; defaults to now. */
  receivedAt?: Date
}): Promise<void> {
  await db.insert(channelMessages).values([
    {
      id: crypto.randomUUID(),
      channelConnectionId: params.channelConnectionId,
      platformUserId: params.platformUserId,
      platformUsername: params.platformUsername,
      direction: "inbound",
      content: params.userText,
      createdAt: params.receivedAt ?? new Date(),
    },
    {
      id: crypto.randomUUID(),
      channelConnectionId: params.channelConnectionId,
      platformUserId: params.platformUserId,
      platformUsername: params.platformUsername,
      direction: "outbound",
      content: params.assistantText,
      tokenCount: params.totalTokens,
      createdAt: new Date(),
    },
  ])
}
