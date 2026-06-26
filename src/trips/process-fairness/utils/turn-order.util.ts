/** Fisher-Yates shuffle for fair speaking order */
export function shuffleTurnOrder(memberIds: string[]): string[] {
  const order = [...memberIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export function parseTurnOrder(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === 'string');
}

export function currentSpeakerUserId(
  turnOrder: string[],
  currentTurn: number,
  status: string,
): string | null {
  if (status !== 'collecting') return null;
  if (currentTurn < 0 || currentTurn >= turnOrder.length) return null;
  return turnOrder[currentTurn] ?? null;
}

export function allMembersSpoken(
  turnOrder: string[],
  currentTurn: number,
): boolean {
  return turnOrder.length > 0 && currentTurn >= turnOrder.length;
}
