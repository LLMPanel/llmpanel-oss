"use client"

import { Loader2, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { BillingQuota } from "@/hooks/use-billing"

/**
 * Consent step for a deployment that increases the customer's bill.
 *
 * Plans with an overage price do not block when the allowance runs out — they
 * bill, which is what "+$8 each" means. That makes this dialog the only place
 * the customer is told, so it must not be skippable: raising someone's
 * recurring charge on a click they had no reason to read as a purchase is not
 * something to do quietly.
 *
 * Renders nothing in the open-source build, where quota is always null.
 */
export function OverageConfirmDialog({
  open,
  onOpenChange,
  quota,
  onConfirm,
  submitting,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  quota: BillingQuota | null
  onConfirm: () => void
  submitting: boolean
}) {
  if (!quota) return null

  const price = quota.nextDeploymentUsd
  const ordinal = quota.used + 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-primary/10 ring-1 ring-inset ring-primary/15">
            <TrendingUp className="size-5 text-primary" />
          </div>
          <DialogTitle>This adds ${price}/mo to your plan</DialogTitle>
          <DialogDescription>
            Your {quota.planName} plan includes {quota.included} deployment
            {quota.included === 1 ? "" : "s"}, and this would be your {ordinal}
            {ordinalSuffix(ordinal)}.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">{quota.planName} plan</span>
            <span className="tabular-nums">${quota.priceUsd}/mo</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-muted-foreground">
              Extra deployments ({quota.overage + 1} × ${price})
            </span>
            <span className="tabular-nums">${(quota.overage + 1) * price}/mo</span>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t pt-2.5 font-medium">
            <span>New monthly total</span>
            <span className="tabular-nums">
              ${quota.priceUsd + (quota.overage + 1) * price}/mo
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Charged for as long as the deployment exists. Destroy it and your bill returns
          to ${quota.priceUsd + quota.overage * price}/mo from the next billing period.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Deploying…
              </>
            ) : (
              <>Confirm — add ${price}/mo</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ordinalSuffix(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th"
  if (n % 10 === 1) return "st"
  if (n % 10 === 2) return "nd"
  if (n % 10 === 3) return "rd"
  return "th"
}
