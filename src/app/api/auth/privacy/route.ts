import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { currentUser, SESSION_COOKIE } from "@/lib/auth";
import { eraseUserData } from "@/lib/store";

export const DELETE = secureRoute(
  async (request) => {
    const user = await currentUser();
    if (!user)
      return NextResponse.json(
        { error: "Connexion requise." },
        { status: 401 },
      );
    const { confirmation } = z
      .object({ confirmation: z.string().email().max(254) })
      .parse(await request.json());
    if (confirmation.trim().toLowerCase() !== user.email.toLowerCase())
      return NextResponse.json(
        { error: "L’adresse saisie ne correspond pas au compte connecté." },
        { status: 400 },
      );

    await eraseUserData(user.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  },
  { allowViewer: true, audit: false },
);
