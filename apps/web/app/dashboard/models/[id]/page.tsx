import { redirect } from "next/navigation"

// No per-model detail view yet — send visitors back to the model catalog.
// An empty page.tsx breaks `next build`.
export default function ModelDetailPage() {
  redirect("/dashboard/models")
}
