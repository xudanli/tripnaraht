/**
 * Deterministic package presentation order for research sessions.
 * MVP: rotated Latin-style order from session seed (stable per session).
 */
export function orderPackagesForSession(
  packageIds: string[],
  seed: string,
  mode: 'LATIN_SQUARE' | 'RANDOM' = 'LATIN_SQUARE',
): string[] {
  if (packageIds.length <= 1) return [...packageIds];

  if (mode === 'RANDOM') {
    const arr = [...packageIds];
    let h = hashString(seed);
    for (let i = arr.length - 1; i > 0; i--) {
      h = (h * 1103515245 + 12345) >>> 0;
      const j = h % (i + 1);
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  }

  const offset = hashString(seed) % packageIds.length;
  return [...packageIds.slice(offset), ...packageIds.slice(0, offset)];
}

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}
