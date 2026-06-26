export const DEFAULT_LIVE_TOOLS = ['weather', 'flight', 'hotel', 'car_rental'] as const;

export function normalizeLiveTools(value: unknown): readonly string[] {
  if (value === true) {
    return DEFAULT_LIVE_TOOLS;
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((tool) => String(tool).trim().toLowerCase())
    .filter(Boolean);
}
