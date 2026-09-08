import type { Context } from "hono"
import { getWorkspaceId } from "../lib/workspace-context"
import {
  getInvoiceDownloadUrl,
  getQuota,
  getSeats,
  isBillingEnabled,
  listInvoices,
  listPlans,
} from "../services/billing.service"

/**
 * GET /api/v1/billing/summary
 *
 * Everything the billing page needs in one call: whether billing applies at
 * all, the workspace's plan and quota position, and the plans it could move to.
 *
 * On a self-hosted install this returns `enabled: false` with empty data rather
 * than 404, so the frontend can hide the billing UI without special-casing an
 * error response.
 */
export const getBillingSummary = async (c: Context) => {
  if (!isBillingEnabled()) {
    return c.json({ enabled: false, quota: null, seats: null, plans: [] })
  }

  const workspaceId = getWorkspaceId(c)
  const [quota, seats] = await Promise.all([getQuota(workspaceId), getSeats(workspaceId)])

  return c.json({ enabled: true, quota, seats, plans: listPlans() })
}

/**
 * GET /api/v1/billing/invoices
 *
 * The workspace's billing history as issued by the payment provider — one entry per paid
 * order, which for a monthly subscription means one per month.
 */
export const getInvoices = async (c: Context) => {
  if (!isBillingEnabled()) {
    return c.json({ enabled: false, invoices: [] })
  }

  const workspaceId = getWorkspaceId(c)
  return c.json({ enabled: true, invoices: await listInvoices(workspaceId) })
}

/**
 * GET /api/v1/billing/invoices/:orderId/download
 *
 * Returns a URL to the provider's PDF rather than proxying the bytes: the URL is
 * short-lived and issued by the party that legally owns the document.
 *
 * 202 means the provider is still rendering the PDF — generation is asynchronous, so
 * the first request for a never-downloaded invoice legitimately lands here and
 * the client should retry.
 */
export const downloadInvoice = async (c: Context) => {
  if (!isBillingEnabled()) {
    return c.json({ error: "Billing is not enabled" }, 404)
  }

  const workspaceId = getWorkspaceId(c)
  const orderId = c.req.param("orderId")

  const result = await getInvoiceDownloadUrl(workspaceId, orderId)
  if (result.status === "ready") return c.json({ url: result.url })
  if (result.status === "generating") {
    return c.json({ error: "Invoice is still being generated. Try again shortly." }, 202)
  }
  return c.json({ error: "Invoice not found" }, 404)
}
