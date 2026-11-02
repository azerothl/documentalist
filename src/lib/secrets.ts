// A write-only marker: sending it back retains the stored secret.
export const SECRET_MASK = "••••••••";
const secretNames = new Set([
  "apiKey",
  "accessPassword",
  "password",
  "password_hash",
  "token",
  "secret",
  "webhookUrl",
]);

export function clientData<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clientData) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([name, entry]) => {
      if (name === "allowedEmails") return [name, []];
      return [
        name,
        secretNames.has(name)
          ? entry
            ? SECRET_MASK
            : entry
          : clientData(entry),
      ];
    }),
  ) as T;
}

export function mergeSecrets<T extends Record<string, unknown>>(
  previous: T,
  patch: Partial<T>,
): T {
  return {
    ...previous,
    ...Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== SECRET_MASK),
    ),
  };
}
