import nodemailer from "nodemailer";
import type { AccountTokenPurpose } from "./auth";

function emailSettings() {
  const smtpUrl = process.env.DOCUMENTALIST_SMTP_URL;
  const from = process.env.DOCUMENTALIST_EMAIL_FROM;
  if (!smtpUrl || !from)
    throw new Error(
      "L’envoi de courriels n’est pas configuré. Renseignez DOCUMENTALIST_SMTP_URL et DOCUMENTALIST_EMAIL_FROM.",
    );
  let protocol: string;
  try {
    protocol = new URL(smtpUrl).protocol;
  } catch {
    throw new Error("DOCUMENTALIST_SMTP_URL n’est pas une URL SMTP valide.");
  }
  if (protocol !== "smtp:" && protocol !== "smtps:")
    throw new Error(
      "DOCUMENTALIST_SMTP_URL doit utiliser smtp:// ou smtps://.",
    );
  return { smtpUrl, from };
}

export function emailIsConfigured() {
  try {
    emailSettings();
    return true;
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function appUrl(path: string) {
  const base = (
    process.env.DOCUMENTALIST_URL || "http://localhost:3000"
  ).replace(/\/+$/, "");
  return `${base}${path}`;
}

async function send(to: string, subject: string, text: string, html: string) {
  const { smtpUrl, from } = emailSettings();
  await nodemailer.createTransport(smtpUrl).sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
}

export async function sendAccountLink(input: {
  email: string;
  name: string;
  token: string;
  purpose: AccountTokenPurpose;
}) {
  const url = appUrl(
    `/account/activate?token=${encodeURIComponent(input.token)}`,
  );
  const name = escapeHtml(input.name);
  const label =
    input.purpose === "setup"
      ? "Créer mon mot de passe"
      : "Choisir un nouveau mot de passe";
  const subject =
    input.purpose === "setup"
      ? "Votre compte Documentalist est prêt"
      : "Réinitialisez votre mot de passe Documentalist";
  await send(
    input.email,
    subject,
    `Bonjour ${input.name},\n\n${label} : ${url}\n\nCe lien expire dans ${input.purpose === "setup" ? "24 heures" : "1 heure"}.`,
    `<p>Bonjour ${name},</p><p>${label} en suivant ce lien :</p><p><a href="${url}">${label}</a></p><p>Ce lien expire dans ${input.purpose === "setup" ? "24 heures" : "1 heure"}.</p>`,
  );
}

export async function sendPortalMagicLink(input: {
  email: string;
  spaceName: string;
  token: string;
}) {
  const url = appUrl(`/portal/access?token=${encodeURIComponent(input.token)}`);
  const spaceName = escapeHtml(input.spaceName);
  const subjectName = input.spaceName.replace(/[\r\n]+/g, " ").slice(0, 120);
  await send(
    input.email,
    `Votre accès à ${subjectName}`,
    `Vous avez été invité à consulter ${input.spaceName}. Ouvrez ce lien pour accéder à la documentation : ${url}\n\nCe lien expire dans 24 heures.`,
    `<p>Vous avez été invité à consulter <strong>${spaceName}</strong>.</p><p><a href="${url}">Ouvrir la documentation</a></p><p>Ce lien expire dans 24 heures.</p>`,
  );
}
