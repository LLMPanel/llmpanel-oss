import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
  title: "Set up",
};

export default function RegisterPage() {
  return <RegisterForm />;
}
