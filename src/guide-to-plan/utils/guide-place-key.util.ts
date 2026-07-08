/**
 * Normalize place names for cross-guide deduplication (same POI, different spelling).
 */
export function normalizePlaceKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s·・\-_—]+/g, '')
    .replace(/[（(].*?[）)]/g, '');
}

export function inspirationCandidateGroupKey(candidate: {
  placeId: number | null;
  rawName: string;
  candidateType: string;
}): string {
  if (candidate.placeId != null) {
    return `pid:${candidate.placeId}:${candidate.candidateType}`;
  }
  return `name:${normalizePlaceKey(candidate.rawName)}:${candidate.candidateType}`;
}

export function normalizeClaimKey(statement: string): string {
  return statement
    .toLowerCase()
    .trim()
    .replace(/[\s·・\-_—，,。.!！?？；;：:]+/g, '')
    .slice(0, 120);
}
