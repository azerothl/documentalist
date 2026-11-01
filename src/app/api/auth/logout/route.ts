import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { secureRoute } from "@/lib/api";
import { logout, SESSION_COOKIE } from "@/lib/auth";
export const POST = secureRoute(
  async () => {
    logout((await cookies()).get(SESSION_COOKIE)?.value ?? "");
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  },
  { public: true },
);
