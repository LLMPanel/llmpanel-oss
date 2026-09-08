"use client"

import { use } from "react"
import { Bot, Boxes, KeyRound, MessageSquare, Radio } from "lucide-react"
import { motion, MotionConfig } from "motion/react"
import { BackupS3Dialog } from "@/components/backups/backup-s3-dialog"
import { RestoreS3Dialog } from "@/components/backups/restore-s3-dialog"
import { CreateSnapshotDialog } from "@/components/backups/create-snapshot-dialog"
import { ImportSnapshotDialog } from "@/components/backups/import-snapshot-dialog"
import { SnapshotList } from "@/components/backups/snapshot-list"
import { useDeploymentBackups } from "@/hooks/use-deployment-backups"

// ── What gets included in a snapshot ─────────────────────────────────

const INCLUDED = [
  {
    icon: Bot,
    label: "Agents",
    description: "Configs, system prompts and knowledge-base attachments.",
  },
  {
    icon: MessageSquare,
    label: "Conversations",
    description: "Agent chat threads and messages, plus channel history.",
  },
  {
    icon: Boxes,
    label: "Knowledge base",
    description:
      "RAG collections, documents and chunks with embeddings — the vector index rebuilds itself on restore.",
  },
  {
    icon: KeyRound,
    label: "API keys",
    description:
      "Key hashes, scopes and rate limits, so existing integrations keep working after a restore.",
  },
  {
    icon: Radio,
    label: "Channels & alerts",
    description:
      "Messaging channel connections and alert rules. Logs, metrics and image history are opt-in.",
  },
]

export default function DeploymentBackupsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: deploymentId } = use(params)
  const { backups, isLoading, refetch } = useDeploymentBackups(deploymentId)

  return (
    <MotionConfig reducedMotion="user">
    <div className="max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 px-1 pt-1">
        <div>
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.025em]">Backups</h1>
          <p className="mt-1.5 text-[14px] text-muted-foreground">
            Snapshot, restore, export and import everything in this deployment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportSnapshotDialog deploymentId={deploymentId} onComplete={() => void refetch()} />
          <CreateSnapshotDialog deploymentId={deploymentId} onComplete={() => void refetch()} />
        </div>
      </header>

      <SnapshotList backups={backups} isLoading={isLoading} onChanged={() => void refetch()} />

      {/* What gets backed up */}
      <Group
        title="What gets backed up"
        hint="One versioned JSON snapshot. Restoring merges it back in — matching rows are updated, missing ones recreated, nothing deleted."
      >
        <ul className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {INCLUDED.map(({ icon: Icon, label, description }) => (
            <li key={label} className="flex items-start gap-4 px-5 py-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-medium">{label}</p>
                <p className="mt-0.5 text-[13px] leading-[1.45] text-muted-foreground">{description}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="border-t border-black/[0.05] px-5 py-3 text-[12px] leading-[1.45] text-muted-foreground dark:border-white/[0.06]">
          Backup files contain your chat history and API key hashes — treat them like secrets.
          Encrypted credentials stay encrypted and only work on this server.
        </p>
      </Group>

      {/* Cloud backup */}
      <Group title="Cloud backup" hint="All RAG data across every deployment, to or from an S3 bucket. Agents and chats aren’t included yet.">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-[14px] font-medium">Amazon S3</p>
          <div className="flex items-center gap-2">
            <RestoreS3Dialog />
            <BackupS3Dialog />
          </div>
        </div>
      </Group>
    </div>
    </MotionConfig>
  )
}

/** Inset-grouped section: sentence-case title + hint above a hairline-ring card. */
function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      className="space-y-1.5"
    >
      <div className="px-3">
        <h2 className="text-[12px] font-medium text-muted-foreground">{title}</h2>
        {hint && <p className="mt-0.5 text-[12px] leading-[1.45] text-muted-foreground/70">{hint}</p>}
      </div>
      <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-black/[0.06] dark:ring-white/[0.06]">
        {children}
      </div>
    </motion.section>
  )
}
