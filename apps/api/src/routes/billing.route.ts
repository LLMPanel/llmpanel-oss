// apps/api/src/routes/billing.route.ts
//
// Read-only billing state. Checkout, the customer portal and payment webhooks
// are not here — the billing provider's Better Auth plugin mounts those under
// the auth base path, and only in cloud mode. On a self-hosted install this
// route answers `enabled: false` and nothing else exists.
import { Hono } from "hono"
import { sessionAuth } from "../middlewares/session-auth.middleware"
import { requireRole } from "../middlewares/require-role.middleware"
import {
  getBillingSummary,
  getInvoices,
  downloadInvoice,
} from "../controllers/billing.controller"

export const billingRoute = new Hono()
  .use(sessionAuth)
  // GET /api/v1/billing/summary
  //
  // Readable by every member, not just owners: the deploy flow reads quota to
  // decide whether to gate or warn, and members deploy.
  .get("/summary", getBillingSummary)
  // Invoices are owner-only, matching how the rest of the app treats billing
  // and provider credentials — they carry amounts, tax and a billing address.
  .get("/invoices", requireRole("owner"), getInvoices)
  .get("/invoices/:orderId/download", requireRole("owner"), downloadInvoice)
