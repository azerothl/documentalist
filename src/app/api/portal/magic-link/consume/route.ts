import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import {
  consumePortalMagicToken,
  cookieOptions,
  getPortalMagicToken,
  portalCookieName,
  tokenDigest,
} from "@/lib/auth";
import { getSpace } from "@/lib/store";

export const POST = secureRoute(
  async (request) => {
    const { token } = z
      .object({ token: z.string().min(32).max(128) })
      .parse(await request.json());
    const invitation = getPortalMagicToken(token);
    if (!invitation)
      return NextResponse.json(
        { error: "Ce lien est invalide ou a expiré. Demandez-en un nouveau." },
        { status: 403 },
      );
    const space = await getSpace(invitation.space_id);
    if (
      !space?.publishedSnapshot ||
      space.accessMode !== "magic_link" ||
      !(space.allowedEmails ?? []).some(
        (email) => tokenDigest(email.toLowerCase()) === invitation.email_hash,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Le portail n’est pas encore publié avec cet accès, ou l’invitation a été retirée.",
        },
        { status: 409 },
      );
    }
    const access = consumePortalMagicToken(token);
    if (!access)
      return NextResponse.json(
        { error: "Ce lien vient d’expirer ou a déjà été utilisé." },
        { status: 403 },
      );
    const response = NextResponse.json({ slug: space.slug });
    response.cookies.set(portalCookieName(space.id), access.sessionToken, {
      ...cookieOptions,
      path: `/p/${space.slug}`,
      maxAge: 8 * 60 * 60,
    });
    return response;
  },
  { public: true },
);
