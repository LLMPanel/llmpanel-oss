import { redirect } from "next/navigation";

// middleware.ts already routes "/" based on session presence; this is the
// fallback for requests that never reach it.
export default function Home() {
  redirect("/dashboard");
}
