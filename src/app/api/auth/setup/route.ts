import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { secureRoute } from "@/lib/api";
import { createUser, hasUsers, setupToken } from "@/lib/auth";

export const POST = secureRoute(
  async (request) => {
    if (hasUsers())
      return NextResponse.json(
        { error: "Le compte initial existe déjà." },
        { status: 409 },
      );
    const body = await request.json();
    const actual = Buffer.from(String(body.token ?? ""));
    const expected = Buffer.from(setupToken());
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return NextResponse.json(
        { error: "Code d’installation incorrect." },
        { status: 403 },
      );
    createUser(
      {
        email: String(body.email ?? ""),
        name: String(body.name ?? ""),
        password: String(body.password ?? ""),
        role: "admin",
      },
      true,
    );
    return NextResponse.json({ ok: true });
  },
  { public: true },
);
