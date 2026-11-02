import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { createAccountToken } from "@/lib/auth";
import { database } from "@/lib/database";
import { emailIsConfigured, sendAccountLink } from "@/lib/email";

export const POST = secureRoute(
  async (request) => {
    const { id } = z
      .object({ id: z.string().min(1) })
      .parse(await request.json());
    if (!emailIsConfigured())
      return NextResponse.json(
        { error: "L’envoi de courriels n’est pas configuré sur le serveur." },
        { status: 503 },
      );
    const user = database()
      .prepare(
        "SELECT id,email,name,disabled,password_set FROM users WHERE id=?",
      )
      .get(id) as
      | {
          id: string;
          email: string;
          name: string;
          disabled: number;
          password_set: number;
        }
      | undefined;
    if (!user)
      return NextResponse.json(
        { error: "Compte introuvable." },
        { status: 404 },
      );
    if (user.disabled)
      return NextResponse.json(
        { error: "Réactivez ce compte avant d’envoyer un lien." },
        { status: 409 },
      );
    const purpose = user.password_set ? "reset" : "setup";
    const token = createAccountToken(user.id, purpose);
    await sendAccountLink({ ...user, token, purpose });
    return NextResponse.json({ ok: true });
  },
  { admin: true },
);
