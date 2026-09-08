"use client"

import { useState } from "react"
import { Loader2, Eye, EyeOff, RefreshCw, Copy, Check } from "lucide-react"
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
import { createUser } from "@/hooks/use-admin-users"
import { generatePassword } from "@/lib/password"

type Role = "user" | "admin"

interface AddUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: () => void
}

export function AddUserDialog({ open, onOpenChange, onAdded }: AddUserDialogProps) {
  const [username, setUsername] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<Role>("user")
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setUsername("")
    setName("")
    setPassword("")
    setRole("user")
    setShowPassword(false)
    setCopied(false)
    setSubmitting(false)
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleGenerate = () => {
    setPassword(generatePassword())
    setShowPassword(true)
  }

  const handleCopy = async () => {
    if (!password) return
    await globalThis.navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleSubmit = async () => {
    const cleanUsername = username.trim().toLowerCase()
    if (!cleanUsername || !password) return
    setSubmitting(true)
    setError(null)
    try {
      await createUser({
        username: cleanUsername,
        password,
        name: name.trim() || undefined,
        role,
      })
      toast.success(`User "${cleanUsername}" created`)
      reset()
      onOpenChange(false)
      onAdded()
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create user"
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>
            Generate a username and password. The user signs in with their
            username — no email required.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="off"
              placeholder="alice"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              Lowercase letters, numbers, and . _ - only.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name">Display name (optional)</Label>
            <Input
              id="display-name"
              autoComplete="off"
              placeholder="Alice Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                  className="pr-16"
                />
                <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setShowPassword((s) => !s)}
                    disabled={submitting}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => void handleCopy()}
                    disabled={submitting || !password}
                  >
                    {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerate}
                disabled={submitting}
              >
                <RefreshCw className="size-4" />
                Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Copy and share this password securely — it cannot be retrieved later.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || !username.trim() || password.length < 8}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Create user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
