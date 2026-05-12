/**
 * Output Contract Layer —— 与 JSON Schema 对齐的交付说明
 */
export function renderOutputContractLayer(): string {
  return `## 输出

请返回 **JSON**，字段结构须符合系统 schema：**days[].day** 对应日历 Day；**slots** 含 morning/lunch/afternoon/dinner/evening（evening 可缺省）。

记住：你在合成 **可信的体验候选草案**，不是在输出 **已验证的可执行排程**。`;
}
