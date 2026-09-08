"use client"

import { useState, type FormEvent } from "react"
import { Loader2, Mail, UserPlus } from "lucide-react"
import { toast } from "sonner"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { organization } from "@/lib/auth-client"
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  WORKSPACE_ROLES,
  isWorkspaceRole,
  type WorkspaceRole,
} from "@/lib/workspace"
import { InviteLinkBox } from "@/components/members/invite-link"

interface InviteMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceName: string
  onInvited: () => void
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  workspaceName,
  onInvited,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<WorkspaceRole>("member")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitationId, setInvitationId] = useState<string | null>(null)

  const reset = () => {
    setEmail("")
    setRole("member")
    setSubmitting(false)
    setError(null)
    setInvitationId(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (submitting) return
    if (!next) reset()
    onOpenChange(next)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail) return

    setSubmitting(true)
    setError(null)
    try {
      const result = await organization.inviteMember({
        email: cleanEmail,
        role,
      })
      if (result.error || !result.data) {
        setError(result.error?.message ?? "Could not send the invitation.")
        return
      }
      setInvitationId(result.data.id)
      toast.success(`Invitation created for ${cleanEmail}`)
      onInvited()
    } catch {
      setError("Could not reach the server. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {invitationId ? (
          <>
            <DialogHeader>
              <DialogTitle>Invitation ready</DialogTitle>
              <DialogDescription>
                {email.trim().toLowerCase()} can join {workspaceName} as{" "}
                {ROLE_LABELS[role].toLowerCase()}.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-3">
              <div className="space-y-2">
                <Label>Share this link with them</Label>
                <InviteLinkBox invitationId={invitationId} />
              </div>
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Mail className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  An email was also sent if outbound email is configured on this
                  instance. The link works either way.
                </span>
              </p>
            </DialogBody>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
              <Button
                onClick={() => {
                  setInvitationId(null)
                  setEmail("")
                  setError(null)
                }}
              >
                <UserPlus />
                Invite another
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <DialogHeader>
              <DialogTitle>Invite member</DialogTitle>
              <DialogDescription>
                Invite someone to {workspaceName}. You will get a link to share
                with them.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="off"
                  autoFocus
                  placeholder="teammate@example.com"
                  value={email}
                  disabled={submitting}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    if (error) setError(null)
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select
                  value={role}
                  onValueChange={(value) => {
                    if (isWorkspaceRole(value)) setRole(value)
                  }}
                >
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKSPACE_ROLES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {ROLE_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
              </div>

              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : null}
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
              <Button type="submit" disabled={submitting || !email.trim()}>
                {submitting ? <Loader2 className="animate-spin" /> : null}
                Send invite
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
