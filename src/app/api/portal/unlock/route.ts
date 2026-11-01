import { NextResponse } from "next/server";
import { secureRoute } from "@/lib/api";
import { getSpace } from "@/lib/store";
import {
  verifyPassword,
  portalTicket,
  portalCookieName,
  cookieOptions,
} from "@/lib/auth";
import { rateLimit } from "@/lib/database";
export const POST = secureRoute(
  async (request) => {
    const { slug, password } = await request.json();
    if (
      typeof slug !== "string" ||
      typeof password !== "string" ||
      password.length > 256
    )
      throw new Error("Données invalides.");
    if (!rateLimit(`portal:${slug}`, 10, 600_000))
      return NextResponse.json(
        { error: "Trop de tentatives. Réessayez dans dix minutes." },
        { status: 429 },
      );
    const space = await getSpace(slug);
    if (
      !space?.isPublic ||
      !space.publishedSnapshot ||
      !space.accessPassword ||
      !verifyPassword(password, space.accessPassword)
    )
      return NextResponse.json(
        { error: "Mot de passe incorrect." },
        { status: 403 },
      );
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      portalCookieName(space.id),
      portalTicket(space.id, space.accessPassword, Date.now() + 8 * 3600_000),
      { ...cookieOptions, path: `/p/${space.slug}`, maxAge: 8 * 3600 },
    );
    return response;
  },
  { public: true },
);
