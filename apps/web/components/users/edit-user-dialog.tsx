"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { updateUser, type AdminUser } from "@/hooks/use-admin-users"

type Role = "user" | "admin"

interface EditUserDialogProps {
  user: AdminUser | null
  /** The signed-in admin — role edits on your own account are blocked. */
  currentUserId: string | undefined
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function EditUserDialog({ user, currentUserId, onOpenChange, onSaved }: EditUserDialogProps) {
  const [name, setName] = useState("")
  const [role, setRole] = useState<Role>("user")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSelf = user?.id === currentUserId

  useEffect(() => {
    if (user) {
      setName(user.name)
      setRole(user.role)
      setError(null)
      setSubmitting(false)
    }
  }, [user])

  const handleSubmit = async () => {
    if (!user) return
    const cleanName = name.trim()
    if (!cleanName) return
    setSubmitting(true)
    setError(null)
    try {
      await updateUser(user.id, {
        ...(cleanName !== user.name && { name: cleanName }),
        ...(role !== user.role && { role }),
      })
      toast.success(`User "${user.username}" updated`)
      onOpenChange(false)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update user")
    } finally {
      setSubmitting(false)
    }
  }

  const dirty = user ? name.trim() !== user.name || role !== user.role : false

  return (
    <Dialog open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            {user ? <>Update the display name or role for <span className="font-medium">{user.username}</span>.</> : null}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Display name</Label>
            <Input
              id="edit-name"
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as Role)}
              disabled={submitting || isSelf}
            >
              <SelectTrigger id="edit-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            {isSelf ? (
              <p className="text-xs text-muted-foreground">
                You cannot change your own role.
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting || !dirty || !name.trim()}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
