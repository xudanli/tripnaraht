import { createHash } from 'crypto';

/** Short stable fingerprint for JSON-ish snapshots (causal model, etc.). */
export function hashJsonStable(value: unknown): string {
  try {
    const s = JSON.stringify(value ?? null);
    return createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 24);
  } catch {
    return 'invalid_json';
  }
}
