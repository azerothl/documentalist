export type RetentionPolicy = {
  activityDays: number;
  snapshotDays: number;
  backupDays: number;
};

function configuredDays(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw new Error(name + " doit être un nombre entier entre 1 et 3650.");
  return days;
}

export function getRetentionPolicy(): RetentionPolicy {
  return {
    activityDays: configuredDays(
      "DOCUMENTALIST_ACTIVITY_RETENTION_DAYS",
      180,
    ),
    snapshotDays: configuredDays(
      "DOCUMENTALIST_SNAPSHOT_RETENTION_DAYS",
      30,
    ),
    backupDays: configuredDays("DOCUMENTALIST_BACKUP_RETENTION_DAYS", 30),
  };
}

export function getPrivacyNoticeConfig() {
  const controller = process.env.DOCUMENTALIST_PRIVACY_CONTROLLER?.trim() ?? "";
  const address = process.env.DOCUMENTALIST_PRIVACY_ADDRESS?.trim() ?? "";
  const contact = process.env.DOCUMENTALIST_PRIVACY_CONTACT?.trim() ?? "";
  const dpo = process.env.DOCUMENTALIST_PRIVACY_DPO?.trim() ?? "";
  const legalBases =
    process.env.DOCUMENTALIST_PRIVACY_BASES?.trim() ?? "";
  const recipients =
    process.env.DOCUMENTALIST_PRIVACY_RECIPIENTS?.trim() ?? "";
  const transfers =
    process.env.DOCUMENTALIST_PRIVACY_TRANSFERS?.trim() ?? "";

  return {
    controller,
    address,
    contact,
    dpo,
    legalBases,
    recipients,
    transfers,
    configured: Boolean(
      controller && address && contact && legalBases && recipients && transfers,
    ),
  };
}
