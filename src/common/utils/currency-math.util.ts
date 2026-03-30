// src/common/utils/currency-math.util.ts

/**
 * 货币速算工具类
 * 
 * 核心思想：为旅行者提供"脑海中的快捷方式"，而不是精确到小数点后4位的计算器
 * 
 * 算法逻辑：
 * 1. 分析汇率数值，寻找最接近的"整倍数"或"整分数"
 * 2. 生成人类直觉的算术规则（如"除以20"、"乘以7"）
 * 3. 生成快速对照表，方便用户快速估算
 */
export class CurrencyMathUtil {
  /**
   * 生成速算口诀
   * 
   * @param rate 汇率 (1 外币 = 多少本币，例如 JPY -> CNY 是 0.048)
   * @param targetCurrency 本币名称，默认 "元"
   * @returns 速算口诀字符串，如 "直接除以 20"
   */
  static generateRule(rate: number, _targetCurrency: string = '元'): string {
    if (!rate || rate <= 0) {
      return '';
    }

    // 1. 处理汇率极小的情况 (日元、韩元、越南盾)
    // 逻辑：尝试看倒数 (1/rate) 是否接近整数
    const inverse = 1 / rate;

    // 🇯🇵 日元场景 (Rate ≈ 0.048, Inverse ≈ 20.8)
    if (this.isCloseTo(inverse, 20, 0.15)) {
      return `直接除以 20`;
    }

    // 🇰🇷 韩元场景 (Rate ≈ 0.0052, Inverse ≈ 192) -> 接近 200
    if (this.isCloseTo(inverse, 200, 0.2)) {
      return `直接除以 200`;
    }

    // 🇻🇳 越南盾/印尼盾场景 (Rate ≈ 0.0003, Inverse ≈ 3333)
    // 策略：去零法。Rate 0.0003 意味着 10000 越南盾 = 3 元
    if (rate < 0.01) {
      const perTenThousand = Math.round(rate * 10000);
      if (perTenThousand > 0) {
        return `去掉 4 个零，再乘以 ${perTenThousand}`;
      }
    }

    // 2. 处理汇率小于 1 的情况 (泰币、港币、台币)
    // 🇹🇭 泰铢 (Rate ≈ 0.21) -> 接近 1/5
    if (this.isCloseTo(inverse, 5, 0.1)) {
      return `直接除以 5`;
    }

    // 🇹🇼 新台币 (Rate ≈ 0.23) -> 接近 1/4
    if (this.isCloseTo(inverse, 4, 0.1)) {
      return `直接除以 4`;
    }

    // 🇭🇰 港币 (Rate ≈ 0.92) -> 接近 1
    if (this.isCloseTo(rate, 1, 0.1)) {
      return `当成 1:1 算 (打九折)`;
    }

    // Rate ≈ 0.5 (比如某些时期的澳元/新西兰元波动)
    if (this.isCloseTo(rate, 0.5, 0.1)) {
      return `直接打对折 (除以 2)`;
    }

    // 3. 处理汇率大于 1 的情况 (美元、欧元、英镑)
    // 逻辑：四舍五入取整
    const rounded = Math.round(rate);

    // 🇺🇸 美元 (Rate ≈ 7.2)
    if (Math.abs(rate - rounded) < 0.3) {
      return `直接乘以 ${rounded}`;
    }

    // 如果实在找不到规律 (比如 1.63)，就返回保留一位小数
    return `乘以 ${rate.toFixed(1)}`;
  }

  /**
   * 生成快速对照表
   * 
   * 根据汇率生成常用金额的对照表，方便用户快速估算
   * 
   * @param rate 汇率 (1 外币 = 多少本币)
   * @param amounts 要生成对照表的金额数组（外币），默认 [100, 500, 1000, 5000, 10000]
   * @returns 对照表数组，如 [{ local: 100, home: 5 }, { local: 1000, home: 48 }]
   */
  static generateQuickTable(
    rate: number,
    amounts: number[] = [100, 500, 1000, 5000, 10000]
  ): Array<{ local: number; home: number }> {
    if (!rate || rate <= 0) {
      return [];
    }

    return amounts.map((local) => ({
      local,
      home: Math.round(local * rate * 100) / 100, // 保留两位小数
    }));
  }

  /**
   * 格式化速算提示
   * 
   * 生成完整的速算提示文本，包含规则和示例
   * 
   * @param rate 汇率
   * @param currencyCode 货币代码，如 "JPY"
   * @param currencyName 货币名称，如 "日元"
   * @param exampleAmount 示例金额（外币），默认 1000
   * @returns 格式化的提示文本
   */
  static formatTip(
    rate: number,
    currencyCode: string,
    currencyName: string = '',
    exampleAmount: number = 1000
  ): string {
    if (!rate || rate <= 0) {
      return '';
    }

    const rule = this.generateRule(rate);
    if (!rule) {
      return '';
    }

    // 计算示例
    const exampleResult = Math.round(exampleAmount * rate * 100) / 100;
    const currencyDisplay = currencyName || currencyCode;

    return `看到价格 ${rule} 即为人民币\n例：${currencyDisplay}${exampleAmount.toLocaleString()} ≈ ${exampleResult} 元`;
  }

  /**
   * 辅助：判断 value 是否在 target 的容差范围内
   * 
   * @param value 实际值
   * @param target 目标值
   * @param tolerance 容差比例 (0.1 表示允许 10% 的误差)
   * @returns 是否接近目标值
   */
  private static isCloseTo(value: number, target: number, tolerance: number): boolean {
    if (target === 0) {
      return Math.abs(value) < tolerance;
    }
    const diff = Math.abs(value - target);
    return diff / target <= tolerance;
  }
}

