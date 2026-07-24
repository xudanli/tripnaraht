/**
 * Canonical MAX_DAILY_DRIVE — normalize minutes ↔ hours on constraint metadata.
 * Registry P0: unified read path until full Profile Compiler lands.
 */

function readPositiveNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

/** Merge normalized drive limit fields into a constraints object. */
export function normalizeMaxDailyDriveConstraintFields(
  constraints: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...constraints };
  const minutes =
    readPositiveNumber(out.maxDailyDriveMinutes) ??
    readPositiveNumber(out.max_daily_drive_minutes);
  const hours =
    readPositiveNumber(out.maxDailyDrivingHours) ??
    readPositiveNumber(out.maxDailyDriveHours) ??
    readPositiveNumber(out.max_daily_drive_hours);

  if (minutes != null) {
    out.maxDailyDriveMinutes = Math.round(minutes);
    out.maxDailyDrivingHours = minutes / 60;
  } else if (hours != null) {
    out.maxDailyDrivingHours = hours;
    out.maxDailyDriveMinutes = Math.round(hours * 60);
  }

  return out;
}

/** Read daily drive cap in minutes (TEP Profile / SDR-101). */
export function readMaxDailyDriveMinutesFromMetadata(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const constraints = (metadata as Record<string, unknown>).constraints;
  if (!constraints || typeof constraints !== 'object') return undefined;
  const normalized = normalizeMaxDailyDriveConstraintFields(constraints as Record<string, unknown>);
  return readPositiveNumber(normalized.maxDailyDriveMinutes);
}
