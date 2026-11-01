import { NextResponse } from "next/server";
import { secureRoute } from "@/lib/api";
import { login, SESSION_COOKIE, cookieOptions } from "@/lib/auth";
import { rateLimit } from "@/lib/database";

export const POST = secureRoute(
  async (request) => {
    const { email, password } = await request.json();
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      password.length > 256
    )
      throw new Error("Identifiants invalides.");
    if (!rateLimit(`login:${email.toLowerCase()}`, 10, 600_000))
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans dix minutes." },
        { status: 429 },
      );
    const token = login(email, password);
    if (!token)
      return NextResponse.json(
        { error: "Identifiants incorrects." },
        { status: 401 },
      );
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, {
      ...cookieOptions,
      maxAge: 8 * 60 * 60,
    });
    return response;
  },
  { public: true },
);
