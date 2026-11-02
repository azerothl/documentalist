import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { createPortalMagicToken, revokePortalMagicAccess } from "@/lib/auth";
import { emailIsConfigured, sendPortalMagicLink } from "@/lib/email";
import { getSpace, updateSpaceAllowedEmail } from "@/lib/store";

type Params = { params: Promise<{ spaceId: string }> };

export const GET = secureRoute(
  async (_request, { params }: Params) => {
    const { spaceId } = await params;
    const space = await getSpace(spaceId);
    if (!space)
      return NextResponse.json(
        { error: "Espace introuvable." },
        { status: 404 },
      );
    if (space.accessMode !== "magic_link")
      return NextResponse.json(
        {
          error:
            "Choisissez d’abord le mode « lien magique » dans les réglages de cet espace.",
        },
        { status: 409 },
      );
    return NextResponse.json({ emails: space.allowedEmails ?? [] });
  },
  { editor: true },
);

export const POST = secureRoute(
  async (request, { params }: Params) => {
    const { spaceId } = await params;
    const { email: rawEmail } = z
      .object({ email: z.string().email().max(254) })
      .parse(await request.json());
    if (!emailIsConfigured())
      return NextResponse.json(
        {
          error: "Configurez l’envoi SMTP avant d’envoyer des liens magiques.",
        },
        { status: 503 },
      );
    const space = await getSpace(spaceId);
    if (!space)
      return NextResponse.json(
        { error: "Espace introuvable." },
        { status: 404 },
      );
    if (space.accessMode !== "magic_link")
      return NextResponse.json(
        {
          error:
            "Choisissez d’abord le mode « lien magique » dans les réglages de cet espace.",
        },
        { status: 409 },
      );
    const email = rawEmail.trim().toLowerCase();
    await updateSpaceAllowedEmail(space.id, email, true);
    const token = createPortalMagicToken(space.id, email);
    await sendPortalMagicLink({
      email,
      spaceName: space.name,
      token,
    });
    return NextResponse.json({ ok: true, email });
  },
  { editor: true },
);

export const DELETE = secureRoute(
  async (request, { params }: Params) => {
    const { spaceId } = await params;
    const { email: rawEmail } = z
      .object({ email: z.string().email().max(254) })
      .parse(await request.json());
    const space = await getSpace(spaceId);
    if (!space)
      return NextResponse.json(
        { error: "Espace introuvable." },
        { status: 404 },
      );
    const email = rawEmail.trim().toLowerCase();
    await updateSpaceAllowedEmail(space.id, email, false);
    revokePortalMagicAccess(space.id, email);
    return NextResponse.json({ ok: true });
  },
  { editor: true },
);
