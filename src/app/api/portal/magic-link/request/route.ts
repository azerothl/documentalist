import { NextResponse } from "next/server";
import { z } from "zod";
import { secureRoute } from "@/lib/api";
import { createPortalMagicToken, tokenDigest } from "@/lib/auth";
import { emailIsConfigured, sendPortalMagicLink } from "@/lib/email";
import { rateLimit } from "@/lib/database";
import { getSpace } from "@/lib/store";

export const POST = secureRoute(
  async (request) => {
    const { slug, email: rawEmail } = z
      .object({
        slug: z.string().min(1).max(100),
        email: z.string().email().max(254),
      })
      .parse(await request.json());
    const email = rawEmail.trim().toLowerCase();
    if (!rateLimit(`portal-magic:${slug}:${tokenDigest(email)}`, 3, 600_000))
      return NextResponse.json(
        { error: "Trop de demandes. Réessayez dans dix minutes." },
        { status: 429 },
      );
    if (!emailIsConfigured())
      return NextResponse.json(
        { error: "L’envoi de courriels est momentanément indisponible." },
        { status: 503 },
      );
    const space = await getSpace(slug);
    if (
      space?.publishedSnapshot &&
      space.accessMode === "magic_link" &&
      (space.allowedEmails ?? []).includes(email)
    ) {
      const token = createPortalMagicToken(space.id, email);
      try {
        await sendPortalMagicLink({
          email,
          spaceName: space.name,
          token,
        });
      } catch (error) {
        console.error(
          "Portal magic-link delivery failed:",
          error instanceof Error ? error.name : "unknown",
        );
      }
    }
    // Do not reveal whether an address has been invited.
    return NextResponse.json({ ok: true });
  },
  { public: true },
);
