/**
 * 基于路网时间矩阵的日内访问顺序优化（最近邻启发式）。
 */
export function nearestNeighborVisitOrder(
  matrixMinutes: number[][],
  startIndex = 0,
): number[] {
  const n = matrixMinutes.length;
  if (n <= 1) return n === 1 ? [0] : [];

  const visited = new Set<number>();
  const order: number[] = [];
  let current = Math.min(Math.max(startIndex, 0), n - 1);

  while (order.length < n) {
    order.push(current);
    visited.add(current);

    let bestNext = -1;
    let bestCost = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      const cost = matrixMinutes[current]?.[j] ?? Infinity;
      if (cost < bestCost) {
        bestCost = cost;
        bestNext = j;
      }
    }

    if (bestNext < 0) break;
    current = bestNext;
  }

  for (let j = 0; j < n; j++) {
    if (!visited.has(j)) order.push(j);
  }

  return order;
}
