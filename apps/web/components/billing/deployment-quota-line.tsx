"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import type { BillingQuota } from "@/hooks/use-billing"

/**
 * Ambient "3 of 4 deployments" indicator.
 *
 * Safe in the open-source build: it reads our own API, never the payment
 * provider, and
 * `quota` is null on a self-hosted install so it renders nothing at all.
 *
 * The point is that neither the block nor the overage charge is ever a
 * surprise — by the time someone reaches the last step of the deploy wizard
 * they should already know where they stand.
 */
export function DeploymentQuotaLine({
  quota,
  className,
}: {
  quota: BillingQuota | null
  className?: string
}) {
  if (!quota) return null

  const atLimit = !quota.canCreate
  const overIncluded = quota.used >= quota.included
  const unsubscribed = quota.planId === "none"

  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        atLimit ? "text-destructive" : overIncluded ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground",
        className
      )}
    >
      {/* "No plan · 0 of 0 deployments" is technically true and useless.
          An unsubscribed workspace needs a call to action, not a ratio. */}
      {unsubscribed ? (
        <>
          No active plan ·{" "}
          <Link href="/dashboard/billing" className="underline underline-offset-2">
            Choose a plan
          </Link>
        </>
      ) : (
        <>
          {quota.planName} · {quota.used} of {quota.included} deployment
          {quota.included === 1 ? "" : "s"}
          {quota.overage > 0 && ` · ${quota.overage} extra`}
          {atLimit && (
            <>
              {" · "}
              <Link href="/dashboard/billing" className="underline underline-offset-2">
                Upgrade
              </Link>
            </>
          )}
        </>
      )}
    </span>
  )
}
