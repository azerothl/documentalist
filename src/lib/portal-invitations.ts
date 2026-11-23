import type { Space } from "./types";

/** Convert the last inclusive UTC day to the first forbidden instant. */
export function invitationDeadline(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const start = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== day) return null;
  return start + 24 * 60 * 60 * 1000;
}

export function portalInvitationActive(
  space: Pick<Space, "allowedEmails" | "allowedEmailExpirations">,
  email: string,
  now = Date.now(),
): boolean {
  const normalized = email.trim().toLowerCase();
  if (!(space.allowedEmails ?? []).includes(normalized)) return false;
  if (space.allowedEmailExpirations !== undefined &&
      (!space.allowedEmailExpirations || typeof space.allowedEmailExpirations !== "object" || Array.isArray(space.allowedEmailExpirations))) return false;
  const day = space.allowedEmailExpirations?.[normalized];
  if (day === undefined) return true; // Legacy invitations have no deadline.
  const deadline = typeof day === "string" ? invitationDeadline(day) : null;
  return deadline !== null && now < deadline;
}
