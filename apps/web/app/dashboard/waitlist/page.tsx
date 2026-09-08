"use client"

import { Loader2, ServerCrash, ShieldAlert, Download, MailPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useSession } from "@/lib/auth-client"
import { useWaitlist } from "@/hooks/use-waitlist"

/** The founder-pricing offer covers this many customers — shown as X / 50. */
const FOUNDER_SPOTS = 50

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export default function WaitlistPage() {
  const { data: session, isPending } = useSession()
  const role = (session?.user as { role?: string } | undefined)?.role
  const { signups, isLoading, error } = useWaitlist()

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <ShieldAlert className="size-8 text-muted-foreground" />
        <div>
          <h2 className="text-base font-semibold">Admins only</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            You need an admin account to view the waitlist.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Waitlist</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Founder-pricing signups from the marketing site — first{" "}
            {FOUNDER_SPOTS} customers get $9/mo forever.
          </p>
        </div>
        {/* Plain link so the browser handles the download; cookies ride along. */}
        <Button asChild variant="outline" disabled={signups.length === 0}>
          <a href="/api/v1/admin/waitlist/export.csv" download>
            <Download />
            Export CSV
          </a>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <ServerCrash className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      ) : signups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
          <MailPlus className="size-8 text-muted-foreground" />
          <div>
            <h2 className="text-base font-semibold">No signups yet</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Emails from the founder-pricing modal on llmpanel.io will show
              up here.
            </p>
          </div>
        </div>
      ) : (
        <>
          <Badge variant="secondary">
            {signups.length} of {FOUNDER_SPOTS} founder spots claimed
          </Badge>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Signed up</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signups.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.source ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDate(s.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
