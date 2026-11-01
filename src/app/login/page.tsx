import { AuthForm } from "@/components/AuthForm";
import { hasUsers } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Login() {
  if (!hasUsers()) redirect("/setup");
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center p-4"
    >
      <AuthForm />
    </main>
  );
}
