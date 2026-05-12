import type { AlertSeverity } from '../dto/safetravel.dto';

/**
 * AI-Native RSS 精炼层契约（零幻觉提取协议 — 有 `<item>` 时启用）。
 *
 * 提取指令摘要：
 * 1. 标题 (Title)：优先识别颜色标签（Yellow / Orange / Red）并映射到 {@link AlertSeverity}。
 * 2. 描述 (Description)：剥离 HTML，抽取受影响地点与可执行动作（如 Avoid、Slow down）。
 * 3. 发布时间 (pubDate)：必须规范为 ISO-8601；超过 48h 的条目在消费侧视为过期（由调用方 TTL 策略执行）。
 */
export interface SafetravelRSSRefined {
  /** 由颜色/措辞推导：如 Red → critical，Yellow → medium */
  severity: AlertSeverity;
  title: string;
  /** 纯文本正文（已去 HTML） */
  body: string;
  /** `<item><pubDate>` 规范化后的 ISO-8601；缺失或无法解析则省略 */
  published_at?: string;
  /** 若文本中出现可解析 POI，可经 LLM/地理解析填充 WGS84 */
  coordinates?: [number, number];
  /** 从自然语言截止时间（如 “Until Tuesday morning”）结构化；无则省略 */
  valid_until?: string;
  /**
   * 受影响区域（与 `safetravel-rss-refined-llm.prompt` V2 白名单一致）。
   * 规则引擎可填子集；LLM 精炼时可补全，不得引入列表外地名 token。
   */
  affected_regions?: string[];
}
