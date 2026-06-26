import type { InTripMetadataExtension } from '../types/experience-loop.types';

export function parseTripMetadata(raw: unknown): Record<string, unknown> & InTripMetadataExtension {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as Record<string, unknown> & InTripMetadataExtension;
}

export function mergeTripMetadata(
  existing: unknown,
  patch: Partial<InTripMetadataExtension>,
): Record<string, unknown> {
  const base = parseTripMetadata(existing);
  return { ...base, ...patch };
}
