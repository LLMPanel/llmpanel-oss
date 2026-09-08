"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  organization,
  useActiveOrganization,
  useListOrganizations,
} from "@/lib/auth-client"
import { workspaceSlug } from "@/lib/workspace"

function initialsFor(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
  return (letters || name.slice(0, 2) || "W").toUpperCase()
}

/**
 * Everything on the dashboard is scoped to the active workspace, so switching
 * has to invalidate two independent caches: the react-query store (all the
 * `/api/v1/*` hooks) and Next's RSC payload cache. Better Auth's own atoms
 * re-fetch on their own — any `/organization/*` call pokes their signals.
 */
function useWorkspaceRefresh() {
  const router = useRouter()
  const queryClient = useQueryClient()

  return async () => {
    await queryClient.invalidateQueries()
    router.refresh()
  }
}

// ─── Create dialog ───────────────────────────────────────────────────────────

function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const refreshWorkspaceScope = useWorkspaceRefresh()
  const [name, setName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (next: boolean) => {
    if (submitting) return
    if (!next) {
      setName("")
      setError(null)
    }
    onOpenChange(next)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setSubmitting(true)
    setError(null)
    try {
      const created = await organization.create({
        name: trimmed,
        slug: workspaceSlug(trimmed),
      })
      if (created.error || !created.data) {
        setError(created.error?.message ?? "Could not create the workspace.")
        return
      }

      const activated = await organization.setActive({
        organizationId: created.data.id,
      })
      if (activated.error) {
        setError(activated.error.message ?? "Workspace created, but could not switch to it.")
        return
      }

      toast.success(`Workspace "${trimmed}" created`)
      setName("")
      onOpenChange(false)
      await refreshWorkspaceScope()
    } catch {
      setError("Could not reach the server. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void handleSubmit(event)}>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Workspaces keep deployments, providers, and API keys separate. You
              become its owner.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-2">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              autoComplete="off"
              autoFocus
              placeholder="Acme Inc"
              value={name}
              disabled={submitting}
              onChange={(event) => {
                setName(event.target.value)
                if (error) setError(null)
              }}
            />
            <p className="text-xs text-muted-foreground">
              A unique URL slug is generated from the name.
            </p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? <Loader2 className="animate-spin" /> : null}
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Switcher ────────────────────────────────────────────────────────────────

export function WorkspaceSwitcher() {
  const { isMobile } = useSidebar()
  const refreshWorkspaceScope = useWorkspaceRefresh()
  const { data: workspaces, isPending: listPending } = useListOrganizations()
  const { data: activeWorkspace, isPending: activePending } =
    useActiveOrganization()

  const [menuOpen, setMenuOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  // Sessions created before workspaces existed carry no activeOrganizationId.
  // The API falls back to the oldest membership server-side; mirror that here
  // by adopting the first workspace so the client and server agree on scope.
  const adoptedRef = useRef(false)
  useEffect(() => {
    if (adoptedRef.current) return
    if (activePending || listPending) return
    if (activeWorkspace || !workspaces?.length) return
    adoptedRef.current = true
    void organization.setActive({ organizationId: workspaces[0].id })
  }, [activePending, listPending, activeWorkspace, workspaces])

  const activeName = activeWorkspace?.name ?? "Select workspace"
  const isLoading = (listPending || activePending) && !activeWorkspace

  const handleSwitch = async (organizationId: string) => {
    if (organizationId === activeWorkspace?.id || switchingId) return

    setSwitchingId(organizationId)
    try {
      const result = await organization.setActive({ organizationId })
      if (result.error) {
        toast.error(result.error.message ?? "Could not switch workspace")
        return
      }
      await refreshWorkspaceScope()
      setMenuOpen(false)
    } catch {
      toast.error("Could not reach the server. Please try again.")
    } finally {
      setSwitchingId(null)
    }
  }

  if (isLoading) {
    return (
      <SidebarMenuItem>
        <div className="flex h-10 items-center gap-2 px-2">
          <Skeleton className="size-6 shrink-0 rounded-md" />
          <Skeleton className="h-3.5 w-24 group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="h-10 gap-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8!"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
              {initialsFor(activeName)}
            </span>
            <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-[13px] font-medium">
                {activeName}
              </span>
              <span className="truncate text-[10.5px] text-sidebar-foreground/60">
                Workspace
              </span>
            </span>
            <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          side={isMobile ? "bottom" : "right"}
          sideOffset={6}
          className="w-60"
        >
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {(workspaces ?? []).map((workspace) => {
            const isActive = workspace.id === activeWorkspace?.id
            return (
              <DropdownMenuItem
                key={workspace.id}
                onSelect={(event) => {
                  event.preventDefault()
                  void handleSwitch(workspace.id)
                }}
                disabled={Boolean(switchingId)}
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[9px] font-semibold text-muted-foreground">
                  {initialsFor(workspace.name)}
                </span>
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {switchingId === workspace.id ? (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                ) : isActive ? (
                  <Check className="size-3.5 text-primary" />
                ) : null}
              </DropdownMenuItem>
            )
          })}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              // Close the menu ourselves so Radix's close-auto-focus doesn't
              // race the dialog for focus.
              event.preventDefault()
              setMenuOpen(false)
              setCreateOpen(true)
            }}
          >
            <Plus className="text-muted-foreground" />
            Create workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </SidebarMenuItem>
  )
}
