/**
 * Planning Policy Layer —— 编排原则（后续由 Planning Policy Engine 动态注入）
 */
export function renderPlanningPolicyLayer(): string {
  return `## 编排规则（候选约束）

1. **placeId 只能来自上方「候选地点」中的 id；禁止臆造 id。**
2. 优先利用 **cluster / centroid** 保持地理连续性；跨 distant cluster 串联时，confidence 倾向 **low**，**validationRequired=true**，并在 riskTags 中加入 **long_haul** 或 **cross_cluster**。
3. 同一天内同一 placeId 不得重复；全程同一非餐饮地点最多 **2** 次；餐饮（含咖啡酒吧）默认全程最多 **1** 次（与系统修复策略对齐）。
4. lunch/dinner 必须从 RESTAURANT 选点；若候选餐饮不足或不确定，**宁可 deferred=true** 也不要乱填非餐厅。
5. evening 可省略（键不写或 deferred）。`;
}
