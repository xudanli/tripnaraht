/**
 * 灰度发布工具（Scheme E）
 *
 * 按 seed 哈希分桶，用于 KERNEL_NATIVE_EXECUTION_GRAY_PERCENT 等灰度策略
 */

/**
 * 判断 seed 是否落在灰度比例内
 * @param seed 分桶种子（如 userId|requestId）
 * @param percent 灰度比例 1-99，100 表示全量
 * @returns true 表示该请求应走灰度路径
 */
export function isInGrayBucket(seed: string, percent: number): boolean {
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return (h % 100) < percent;
}
