import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { createPortalMagicToken, revokePortalMagicAccess } from "@/lib/auth";
import { emailIsConfigured, sendPortalMagicLink } from "@/lib/email";
import { getSpace, updateSpaceAllowedEmail } from "@/lib/store";
import { invitationDeadline, portalInvitationActive } from "@/lib/portal-invitations";

type Params = { params: Promise<{ spaceId: string }> };
const emailSchema = z.string().email().max(254);
const expirySchema = z.string().refine((day) => invitationDeadline(day) !== null, "Date invalide (AAAA-MM-JJ).").nullable();

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
    return NextResponse.json({ emails: space.allowedEmails ?? [], expirations: space.allowedEmailExpirations ?? {} });
  },
  { editor: true },
);

export const POST = secureRoute(
  async (request, { params }: Params) => {
    const { spaceId } = await params;
    const { email: rawEmail, expiresOn } = z
      .object({ email: emailSchema, expiresOn: expirySchema.optional() })
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
    if ((typeof expiresOn === "string" && invitationDeadline(expiresOn)! <= Date.now()) ||
        (expiresOn === undefined && space.allowedEmails.includes(email) && !portalInvitationActive(space, email)))
      return NextResponse.json({ error: "L’échéance est passée. Choisissez une date à venir pour envoyer un lien." }, { status: 400 });
    await updateSpaceAllowedEmail(space.id, email, true, expiresOn);
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

export const PATCH = secureRoute(
  async (request, { params }: Params) => {
    const { spaceId } = await params;
    const { email: rawEmail, expiresOn } = z.object({ email: emailSchema, expiresOn: expirySchema }).parse(await request.json());
    const space = await getSpace(spaceId);
    if (!space) return NextResponse.json({ error: "Espace introuvable." }, { status: 404 });
    const email = rawEmail.trim().toLowerCase();
    if (!(space.allowedEmails ?? []).includes(email))
      return NextResponse.json({ error: "Cette invitation n’existe plus." }, { status: 404 });
    await updateSpaceAllowedEmail(space.id, email, true, expiresOn, true);
    return NextResponse.json({ ok: true, email, expiresOn });
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
