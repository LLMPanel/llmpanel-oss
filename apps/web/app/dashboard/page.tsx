"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Plus, AlertCircle, RefreshCw, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/hooks/use-billing";
import { DeploymentQuotaLine } from "@/components/billing/deployment-quota-line";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeployments } from "@/hooks/use-deployments";
import { CreateDeploymentModal } from "@/components/deployments/create-deployment-modal";
import { DeploymentCard } from "@/components/deployments/deployment-card";
import { EmptyState } from "@/components/deployments/empty-state";
import { StatsBar } from "@/components/deployments/stats-bar";

/**
 * Mirrors DeploymentCard's layout exactly (h-[11.5rem], same header / status
 * slot / spec line) so loading → loaded causes zero layout shift.
 */
function CardSkeleton() {
  return (
    <div className="flex h-[11.5rem] flex-col overflow-hidden rounded-xl border border-border/60 bg-card px-5 shadow-xs">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-3 pt-5">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-[15px] w-3/5" />
          <Skeleton className="h-[11px] w-2/5" />
        </div>
        <Skeleton className="mt-0.5 h-3 w-16 shrink-0" />
      </div>
      {/* Status slot */}
      <div className="flex min-h-0 flex-1 items-center py-4">
        <Skeleton className="h-[13px] w-4/5" />
      </div>
      {/* Spec line */}
      <div className="flex shrink-0 items-center justify-between border-t border-border/60 py-3.5">
        <Skeleton className="h-[11px] w-32" />
        <Skeleton className="h-[11px] w-20" />
      </div>
    </div>
  );
}

/** The query string only changes on navigation, which remounts the page. */
function subscribeToNothing() {
  return () => {};
}

export default function DashboardHome() {
  const { deployments, isLoading, error, refetch } = useDeployments();
  // null on self-hosted installs — every billing affordance below hides itself.
  const { quota, refetch: refetchQuota } = useBilling();
  const [modalOpen, setModalOpen] = useState(false);
  const [deployPrefill, setDeployPrefill] = useState<{
    providerId: string | null;
    gpu: string | null;
  }>({ providerId: null, gpu: null });

  // ?deploy=1&provider=<id>&gpu=<model> — Deploy CTA from the instances page
  // opens the wizard with that provider selected and the GPU search prefilled.
  // The server has no URL, so the query is read as an external store: the
  // first render matches the server's, and the link applies on the next one.
  const search = useSyncExternalStore(
    subscribeToNothing,
    () => window.location.search,
    () => "",
  );
  const [handledSearch, setHandledSearch] = useState("");
  if (search !== handledSearch) {
    setHandledSearch(search);
    const params = new URLSearchParams(search);
    if (params.get("deploy") === "1") {
      setDeployPrefill({
        providerId: params.get("provider"),
        gpu: params.get("gpu"),
      });
      setModalOpen(true);
    }
  }
  useEffect(() => {
    if (new URLSearchParams(search).get("deploy") === "1") {
      window.history.replaceState(null, "", "/dashboard");
    }
  }, [search]);

  const hasDeployments = deployments.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Deploy and manage your model inference endpoints.
          </p>
          <DeploymentQuotaLine quota={quota} className="block" />
        </div>
        <div className="flex items-center gap-2">
          {hasDeployments && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              className="size-9"
              title="Refresh"
            >
              <RefreshCw className="size-4" />
            </Button>
          )}
          {/* At the plan limit the wizard can only end in a 402, so send them
              somewhere they can act instead. quota is null on self-hosted, so
              this is always the plain button there. */}
          {quota && !quota.canCreate ? (
            <Button asChild className="gap-2">
              <Link href="/dashboard/billing">
                <ArrowUpCircle className="size-4" />
                {quota.planId === "none" ? "Choose a plan" : "Upgrade to deploy"}
              </Link>
            </Button>
          ) : (
            <Button onClick={() => setModalOpen(true)} className="gap-2">
              <Plus className="size-4" />
              New Project
            </Button>
          )}

          <Button onClick={() => setModalOpen(true)} className="gap-2">
            <Plus className="size-4" />
            New Image
          </Button>
        </div>
      </div>

      {/* Stats bar — only show when we have deployments */}
      {hasDeployments && <StatsBar deployments={deployments} />}

      {/* Body */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-24 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="size-5 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-medium">Failed to load deployments</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="size-3.5" />
            Try again
          </Button>
        </div>
      ) : !hasDeployments ? (
        <EmptyState onAdd={() => setModalOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deployments.map((d) => (
            <DeploymentCard key={d.id} deployment={d} />
          ))}
        </div>
      )}

      {/* Modal */}
      <CreateDeploymentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={() => {
          setModalOpen(false);
          refetch();
          void refetchQuota();
        }}
        initialProviderId={deployPrefill.providerId}
        initialGpuQuery={deployPrefill.gpu}
      />
    </div>
  );
}
