import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { safeRedirect } from "@/lib/safe-redirect";

export const metadata: Metadata = {
  title: "Sign in",
};

// Reading search params here rather than with useSearchParams() in LoginForm
// keeps the client component free of a Suspense boundary requirement.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; reset?: string }>;
}) {
  const { redirect, reset } = await searchParams;

  return (
    <LoginForm
      redirectTo={safeRedirect(redirect)}
      passwordReset={reset === "1"}
    />
  );
}
