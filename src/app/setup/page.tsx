import { AuthForm } from "@/components/AuthForm";
import { hasUsers, setupToken } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default function Setup() {
  if (hasUsers()) redirect("/login");
  setupToken();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center p-4"
    >
      <AuthForm setup />
    </main>
  );
}
