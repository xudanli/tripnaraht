/**
 * Uncertainty Layer —— 弱完成态与草案责任字段协议
 */
export function renderUncertaintyLayer(): string {
  return `## 不确定性协议（弱完成态，极其重要）

6. 若候选覆盖不足、地理跨度过大、日历上可能存在闭馆/周末拥堵且你无法核实 —— **降低行程密度**，宁可留白。
7. 允许 **deferred: true**：该时段不设 placeId（或省略 placeId），reason 说明留白原因（如：信息不足、避免跨城硬跳、餐饮候选不足）。
8. 对任何现实不确定性，在 **reason** 中简短标注（示例口吻）：「需后续验证」「可能受天气影响」「车程可能偏长」「营业时间请二次确认」。
9. 每个已填 slot 必须给出 **confidence**（low/medium/high）、**validationRequired**（布尔）、**riskTags**（数组，如 weather_sensitive, long_drive, weekend_crowd, museum_closed_risk）。`;
}
