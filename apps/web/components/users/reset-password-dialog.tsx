"use client"

import { useState, useEffect } from "react"
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
import { toast } from "sonner"
import { resetUserPassword, type AdminUser } from "@/hooks/use-admin-users"
import { generatePassword } from "@/lib/password"

interface ResetPasswordDialogProps {
  user: AdminUser | null
  onOpenChange: (open: boolean) => void
}

export function ResetPasswordDialog({ user, onOpenChange }: ResetPasswordDialogProps) {
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset local state whenever a different user (or none) is targeted.
  useEffect(() => {
    setPassword("")
    setShowPassword(false)
    setCopied(false)
    setSubmitting(false)
    setError(null)
  }, [user])

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
    if (!user || password.length < 8) return
    setSubmitting(true)
    setError(null)
    try {
      await resetUserPassword(user.id, password)
      toast.success(`Password reset for "${user.username}"`)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for{" "}
            <span className="font-medium text-foreground">{user?.username}</span>.
            Their existing sessions will be signed out.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="new-password"
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

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || password.length < 8}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
