import type { BetterAuthPlugin } from "better-auth"

/**
 * Billing bridge.
 *
 * Self-hosted LLMPanel has no plans and no limits: you run it on your own
 * hardware, so deployments are bounded by your GPUs, not by us. Every export
 * below is the permanent, unmetered answer to that, and the dashboard's
 * billing components render nothing when they read it.
 *
 * The hosted service at llmpanel.io swaps this file for one that talks to a
 * payment provider. That is the only difference, and it is why the exported
 * surface here must not change shape.
 */

export interface QuotaSummary {
  planId: string
  planName: string
  priceUsd: number
  used: number
  included: number
  overage: number
  canCreate: boolean
  nextDeploymentUsd: number
  status: string | null
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: string | null
}

export interface PlanSummary {
  id: string
  name: string
  slug: string
  description: string
  priceUsd: number
  includedDeployments: number
  overageUsd: number | null
}

export interface SeatSummary {
  members: number
  pendingInvitations: number
  used: number
  max: number | null
  canAddMember: boolean
  denialReason: string | null
}

export function isBillingEnabled(): boolean {
  return false
}

export async function getSeats(_workspaceId: string): Promise<SeatSummary | null> {
  return null
}

export async function assertSeatAvailable(_workspaceId: string): Promise<void> {
  // Self-hosted workspaces have unlimited seats.
}

export function listPlans(): PlanSummary[] {
  return []
}

export function billingPlugins(): BetterAuthPlugin[] {
  return []
}

export async function getQuota(_workspaceId: string): Promise<QuotaSummary | null> {
  return null
}

export async function checkDeploymentAllowed(
  _workspaceId: string
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  return { allowed: true }
}

export async function reportDeploymentUsage(_workspaceId: string): Promise<void> {
  // No metering in the self-hosted build.
}

export function startUsageReporting(): void {
  // No metering in the self-hosted build.
}

export interface Invoice {
  orderId: string
  invoiceNumber: string
  createdAt: string
  status: string
  paid: boolean
  billingReason: string
  totalAmount: number
  taxAmount: number
  refundedAmount: number
  currency: string
  isInvoiceGenerated: boolean
}

export type InvoiceUrl =
  | { status: "ready"; url: string }
  | { status: "generating" }
  | { status: "not_found" }

export async function listInvoices(_workspaceId: string): Promise<Invoice[]> {
  return []
}

export async function getInvoiceDownloadUrl(
  _workspaceId: string,
  _orderId: string
): Promise<InvoiceUrl> {
  return { status: "not_found" }
}
