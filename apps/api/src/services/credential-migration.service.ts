import { db } from "@llmpanel/db"
import {
  providerConnections,
  agents,
  alertChannels,
  channelConnections,
  ragCollections,
} from "@llmpanel/db/schema"
import { eq, isNotNull } from "drizzle-orm"
import { encrypt, decrypt, aadFor, isLegacyCiphertext, hasKeyMaterial } from "./encryption.service"

/**
 * Carry every credential onto the current encryption scheme (v3). Runs once at
 * boot; rows already on v3 are skipped, so it's a no-op on healthy installs.
 *
 * It reads whatever scheme a row is on — pre-v2, v2, or v3 — and rewrites it,
 * so it handles both the original legacy sweep and the v2→v3 move after the
 * project rename. A row that fails to decrypt (e.g. ENCRYPTION_KEY changed
 * since it was written) is left untouched and logged, so a partial run is
 * safe to re-run and never destroys a credential it could not read.
 */
export async function migrateLegacyCredentials(): Promise<void> {
  if (!hasKeyMaterial()) return // dev without secrets — nothing to do

  let migrated = 0
  let failed = 0

  type ColumnSpec = {
    label: string
    rows: () => Promise<{ id: string; value: string | null }[]>
    aad: (rowId: string) => string
    update: (rowId: string, value: string) => Promise<unknown>
  }

  const columns: ColumnSpec[] = [
    {
      label: "provider_connections.encrypted_api_key",
      rows: () => db.select({ id: providerConnections.id, value: providerConnections.encryptedApiKey })
        .from(providerConnections).where(isNotNull(providerConnections.encryptedApiKey)),
      aad: aadFor.providerApiKey,
      update: (id, value) => db.update(providerConnections)
        .set({ encryptedApiKey: value }).where(eq(providerConnections.id, id)),
    },
    {
      label: "provider_connections.encrypted_totp_secret",
      rows: () => db.select({ id: providerConnections.id, value: providerConnections.encryptedTotpSecret })
        .from(providerConnections).where(isNotNull(providerConnections.encryptedTotpSecret)),
      aad: aadFor.providerTotpSecret,
      update: (id, value) => db.update(providerConnections)
        .set({ encryptedTotpSecret: value }).where(eq(providerConnections.id, id)),
    },
    {
      label: "agents.encrypted_external_api_key",
      rows: () => db.select({ id: agents.id, value: agents.encryptedExternalApiKey })
        .from(agents).where(isNotNull(agents.encryptedExternalApiKey)),
      aad: aadFor.agentExternalApiKey,
      update: (id, value) => db.update(agents)
        .set({ encryptedExternalApiKey: value }).where(eq(agents.id, id)),
    },
    {
      label: "alert_channels.encrypted_config",
      rows: () => db.select({ id: alertChannels.id, value: alertChannels.encryptedConfig })
        .from(alertChannels).where(isNotNull(alertChannels.encryptedConfig)),
      aad: aadFor.alertChannelConfig,
      update: (id, value) => db.update(alertChannels)
        .set({ encryptedConfig: value }).where(eq(alertChannels.id, id)),
    },
    {
      label: "channel_connections.encrypted_config",
      rows: () => db.select({ id: channelConnections.id, value: channelConnections.encryptedConfig })
        .from(channelConnections).where(isNotNull(channelConnections.encryptedConfig)),
      aad: aadFor.channelConnectionConfig,
      update: (id, value) => db.update(channelConnections)
        .set({ encryptedConfig: value }).where(eq(channelConnections.id, id)),
    },
    {
      label: "rag_collections.encrypted_qdrant_api_key",
      rows: () => db.select({ id: ragCollections.id, value: ragCollections.encryptedQdrantApiKey })
        .from(ragCollections).where(isNotNull(ragCollections.encryptedQdrantApiKey)),
      aad: aadFor.ragQdrantApiKey,
      update: (id, value) => db.update(ragCollections)
        .set({ encryptedQdrantApiKey: value }).where(eq(ragCollections.id, id)),
    },
    {
      label: "rag_collections.encrypted_external_embedding_key",
      rows: () => db.select({ id: ragCollections.id, value: ragCollections.encryptedExternalEmbeddingKey })
        .from(ragCollections).where(isNotNull(ragCollections.encryptedExternalEmbeddingKey)),
      aad: aadFor.ragExternalEmbeddingKey,
      update: (id, value) => db.update(ragCollections)
        .set({ encryptedExternalEmbeddingKey: value }).where(eq(ragCollections.id, id)),
    },
  ]

  for (const col of columns) {
    const rows = await col.rows()
    for (const row of rows) {
      if (!row.value || !isLegacyCiphertext(row.value)) continue
      const context = col.aad(row.id)
      try {
        const plaintext = await decrypt(row.value, context)
        await col.update(row.id, await encrypt(plaintext, context))
        migrated++
      } catch (err) {
        failed++
        console.error(
          `Credential migration: could not re-encrypt ${col.label} row ${row.id} — leaving as-is`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }

  if (migrated > 0 || failed > 0) {
    console.log(`Credentials: ${migrated} re-encrypted to v3, ${failed} failed`)
  }
}
