import { redirect } from "next/navigation"

// Deployments are listed on the main dashboard; this route only exists as
// the parent of /deployments/[id]. An empty page.tsx breaks `next build`.
export default function DeploymentsIndexPage() {
  redirect("/dashboard")
}
