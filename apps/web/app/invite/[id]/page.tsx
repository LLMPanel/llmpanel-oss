import type { Metadata } from "next"

import { InviteAccept } from "@/components/invite/invite-accept"

export const metadata: Metadata = {
  title: "Workspace invitation",
}

// Deliberately outside /dashboard: an invitee may not have a session yet, and
// the page itself bounces them to /login?redirect=/invite/<id> when so.
export default async function InvitePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return <InviteAccept invitationId={id} />
}
