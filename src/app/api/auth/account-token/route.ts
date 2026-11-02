import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { setPasswordFromAccountToken } from "@/lib/auth";
import { rateLimit } from "@/lib/database";

export const POST = secureRoute(
  async (request) => {
    const body = z
      .object({
        token: z.string().min(32).max(128),
        password: z.string().min(12).max(256),
      })
      .parse(await request.json());
    if (!rateLimit(`account-token:${body.token.slice(0, 24)}`, 5, 600_000))
      return NextResponse.json(
        { error: "Trop de tentatives. Demandez un nouveau lien." },
        { status: 429 },
      );
    setPasswordFromAccountToken(body.token, body.password);
    return NextResponse.json({ ok: true });
  },
  { public: true },
);
