/**
 * P2 — RFC-001 formal table storage modes.
 *
 * OFF: metadata only (legacy)
 * DUAL_WRITE: write table + metadata; read metadata (safe rollout)
 * TABLE_PRIMARY: write both; read table with metadata fallback
 * TABLE_ONLY: write/read table only (cutover)
 */

export type Rfc001TableStorageMode =
  | 'OFF'
  | 'DUAL_WRITE'
  | 'TABLE_PRIMARY'
  | 'TABLE_ONLY';

export function resolveRfc001TableStorageMode(): Rfc001TableStorageMode {
  const raw = process.env.P2_RFC001_TABLE_STORAGE?.trim().toUpperCase();
  if (
    raw === 'OFF' ||
    raw === 'DUAL_WRITE' ||
    raw === 'TABLE_PRIMARY' ||
    raw === 'TABLE_ONLY'
  ) {
    return raw;
  }
  return 'OFF';
}

export function isRfc001TableWriteEnabled(): boolean {
  const m = resolveRfc001TableStorageMode();
  return m === 'DUAL_WRITE' || m === 'TABLE_PRIMARY' || m === 'TABLE_ONLY';
}

export function isRfc001MetadataWriteEnabled(): boolean {
  return resolveRfc001TableStorageMode() !== 'TABLE_ONLY';
}

export function isRfc001TableReadPreferred(): boolean {
  const m = resolveRfc001TableStorageMode();
  return m === 'TABLE_PRIMARY' || m === 'TABLE_ONLY';
}

export function isRfc001MetadataReadFallbackEnabled(): boolean {
  return resolveRfc001TableStorageMode() !== 'TABLE_ONLY';
}
