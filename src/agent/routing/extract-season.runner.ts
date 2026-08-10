/**
 * 从日期提取季节（纯函数，从 ClaudeOrchestrator 迁出）。
 */

export function extractSeason(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter';
  } catch {
    return 'all';
  }
}
