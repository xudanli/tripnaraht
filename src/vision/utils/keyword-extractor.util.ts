// src/vision/utils/keyword-extractor.util.ts

/**
 * 关键词提取工具
 * 
 * 从 OCR 文本中提取 POI 关键信息，自动忽略噪声（价格、营业时间等）
 */
export class KeywordExtractor {
  /**
   * 价格模式（预过滤）
   * 支持：$10, €5.50, ¥1000, 100元, 100円
   */
  private readonly pricePatterns = [
    // 货币符号在前
    /[$€£¥]\s*\d+(\.\d+)?/g,
    // 货币符号在后
    /\d+(\.\d+)?\s*[元円ドルユーロ]/g,
    // 价格相关词汇
    /\b(price|cost|fee|admission|entry|ticket|入場料|料金|価格)\s*[:：]?\s*\d+/gi,
  ];

  /**
   * 时间段模式（预过滤）
   * 支持：9:00-18:00, 09:00 AM - 10:00 PM, 9時～18時
   */
  private readonly timePatterns = [
    // 24小时制：9:00-18:00, 09:00-22:00
    /\b\d{1,2}:\d{2}\s?[-–—]\s?\d{1,2}:\d{2}\b/g,
    // 12小时制：9:00 AM - 10:00 PM
    /\b\d{1,2}:\d{2}\s?(AM|PM|am|pm)\s?[-–—]\s?\d{1,2}:\d{2}\s?(AM|PM|am|pm)\b/g,
    // 日语时间：9時～18時, 9:00～22:00（注意：字符类中的破折号需要转义或放在开头/结尾）
    /\b\d{1,2}[時:]\d{0,2}\s?[～〜\u2013\u2014-]\s?\d{1,2}[時:]\d{0,2}\b/g,
    // 时间段相关词汇
    /\b(open|closed|hours|営業時間|開店|閉店|open now|closing soon|営業中|閉店中)\b/gi,
  ];

  /**
   * 星期模式（预过滤）
   */
  private readonly dayPatterns = [
    /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
    /\b(月|火|水|木|金|土|日)[曜日]?\b/g,
  ];

  /**
   * 领域停用词（预过滤）
   */
  private readonly stopWords = new Set([
    // 时间相关
    'open',
    'closed',
    'hours',
    'now',
    'today',
    'tomorrow',
    // 价格相关
    'price',
    'cost',
    'fee',
    'free',
    'admission',
    'entry',
    'ticket',
    // 状态相关
    'available',
    'unavailable',
    'full',
    'empty',
    // 中文停用词
    '营业时间',
    '开放时间',
    '价格',
    '费用',
    '免费',
    '入场',
    '门票',
    '营业中',
    '闭店',
    // 日语停用词
    '営業時間',
    '価格',
    '料金',
    '無料',
    '入場',
    'チケット',
    '営業中',
    '閉店',
  ]);

  /**
   * 店铺后缀模式（高优先级）
   */
  private readonly shopSuffixPattern = /(店|館|屋|restaurant|cafe|coffee|shop|store|bar|pub|bistro|レストラン|カフェ|店舗|屋|館)/i;

  /**
   * 菜单关键词（中优先级）
   */
  private readonly menuKeywords = [
    'ramen',
    'sushi',
    'curry',
    '焼肉',
    '拉面',
    '寿司',
    '咖喱',
    '烤肉',
    'pizza',
    'pasta',
    'burger',
    'steak',
    'seafood',
    'pork',
    'beef',
    'chicken',
  ];

  /**
   * 从文本行中提取候选关键词
   * 
   * @param lines OCR 文本行
   * @returns 候选关键词列表（已排序，优先级高的在前）
   */
  extractCandidateKeywords(lines: string[]): string[] {
    const candidates: Array<{ text: string; score: number }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      // 跳过空行
      if (trimmed.length < 2) continue;

      // 预过滤：跳过价格行
      if (this.isPriceLine(trimmed)) continue;

      // 预过滤：跳过时间段行
      if (this.isTimeLine(trimmed)) continue;

      // 预过滤：跳过星期行
      if (this.isDayLine(trimmed)) continue;

      // 预过滤：跳过纯停用词行
      if (this.isStopWordLine(trimmed)) continue;

      // 评分并收集
      const score = this.scoreLine(trimmed);
      if (score > 0) {
        candidates.push({ text: trimmed, score });
      }
    }

    // 按分数排序（高优先级在前）
    candidates.sort((a, b) => b.score - a.score);

    // 返回文本列表（去重）
    const seen = new Set<string>();
    return candidates
      .map((c) => c.text)
      .filter((text) => {
        const normalized = text.toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }

  /**
   * 检查是否为价格行
   */
  private isPriceLine(text: string): boolean {
    return this.pricePatterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为时间段行
   */
  private isTimeLine(text: string): boolean {
    return this.timePatterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为星期行
   */
  private isDayLine(text: string): boolean {
    return this.dayPatterns.some((pattern) => pattern.test(text));
  }

  /**
   * 检查是否为纯停用词行
   */
  private isStopWordLine(text: string): boolean {
    const words = text.toLowerCase().split(/\s+/);
    return words.every((word) => {
      // 移除标点符号
      const cleaned = word.replace(/[^\w\u4e00-\u9fa5]/g, '');
      return cleaned.length === 0 || this.stopWords.has(cleaned);
    });
  }

  /**
   * 为文本行评分
   * 
   * 评分规则：
   * - 包含店铺后缀：+10
   * - 包含菜单关键词：+5
   * - 长度适中（3-30 字符）：+3
   * - 包含命名实体（地名/景点名特征）：+2
   * - 过长（>50 字符）：-5（可能是地址或描述）
   */
  private scoreLine(text: string): number {
    let score = 0;
    const lowerText = text.toLowerCase();

    // 包含店铺后缀 → 高优先级
    if (this.shopSuffixPattern.test(text)) {
      score += 10;
    }

    // 包含菜单关键词 → 中优先级
    if (this.menuKeywords.some((kw) => lowerText.includes(kw.toLowerCase()))) {
      score += 5;
    }

    // 长度适中 → 加分
    const length = text.length;
    if (length >= 3 && length <= 30) {
      score += 3;
    } else if (length > 50) {
      // 过长可能是地址或详细描述
      score -= 5;
    }

    // 包含命名实体特征（中文地名、景点名常见字符）
    // 简化：检查是否包含常见的地名/景点名特征
    const hasChinesePlaceName = /[\u4e00-\u9fa5]{2,}/.test(text);
    const hasEnglishPlaceName = /\b[A-Z][a-z]+\b/.test(text); // 首字母大写的单词
    if (hasChinesePlaceName || hasEnglishPlaceName) {
      score += 2;
    }

    // 只包含数字和符号 → 减分
    if (/^[\d\s\-–—\(\)（）]+$/.test(text)) {
      score -= 10;
    }

    return score;
  }

  /**
   * 提取最可能的店名（Top N）
   * 
   * @param lines OCR 文本行
   * @param topN 返回前 N 个（默认 5）
   * @returns 候选店名列表
   */
  extractCandidateNames(lines: string[], topN: number = 5): string[] {
    const keywords = this.extractCandidateKeywords(lines);
    return keywords.slice(0, topN);
  }
}
