// apps/api/src/routes/backup.route.ts
import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { requireRole } from "../middlewares/require-role.middleware"
import { createBackup, restoreBackup } from "../controllers/backup.controller"
import {
  createSnapshot,
  listSnapshots,
  importSnapshot,
  downloadSnapshot,
  restoreSnapshot,
  deleteSnapshot,
} from "../controllers/deployment-backup.controller"

export const backupRoute = new Hono()
  .use(sessionAuth)
  // Legacy user-wide RAG backup to S3
  .post("/", requireRole("member"), createBackup)
  .post("/restore", requireRole("owner"), restoreBackup)
  // Per-deployment snapshots (local files + history)
  .get("/deployments/:deploymentId", listSnapshots)
  .post("/deployments/:deploymentId", requireRole("member"), createSnapshot)
  .post("/deployments/:deploymentId/import", requireRole("owner"), importSnapshot)
  .get("/snapshots/:backupId/download", downloadSnapshot)
  .post("/snapshots/:backupId/restore", requireRole("owner"), restoreSnapshot)
  .delete("/snapshots/:backupId", requireRole("owner"), deleteSnapshot)
