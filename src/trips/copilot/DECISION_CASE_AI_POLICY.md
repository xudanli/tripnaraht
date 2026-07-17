# Decision Case AI Policy

**原则：** `uiGroup` 管页面分区与打扰等级；`semanticKey` 管上下文模板、解释策略与允许动作。  
**禁止**用 `semanticKey` 做列表分组。

契约代码：[`contracts/decision-case-ai-contracts.ts`](./contracts/decision-case-ai-contracts.ts)  
页面合同：`decision_space@1.4`（[`page-ai-contracts.ts`](./contracts/page-ai-contracts.ts)）

---

## 一、uiGroup → AI 打扰

| uiGroup | AI 是否主动出现 | AI 作用 | 展示方式 |
|---------|-----------------|---------|----------|
| `MUST_CONFIRM` | 是（Case Contract 允许时） | 为什么必须确认、影响、推荐 | 默认展开，靠近确认按钮 |
| `IMPORTANT_CHOICE` | 视影响 / 匹配 | 比较取舍，说明会失去什么 | 轻量卡，可展开 |
| 无 `decisionCase` | 仅高优 | 翻译 Gateway / Canonical | 通用问题卡，不创造新建议 |

机会类：无匹配价值 → `SILENT`（`CASE_PROACTIVE_HOLDS`）。

---

## 二、semanticKey → DecisionCaseAIContract

| semanticKey | aiMode | proactiveMode | 缺上下文 |
|-------------|--------|---------------|----------|
| `REQUIRED_CHOICE.VEHICLE_ROAD_FIT` | EXPLAIN_AND_RECOMMEND | ALWAYS | CONTEXT_MISSING |
| `REQUIRED_CHOICE.RENTAL_INSURANCE` | EXPLAIN_AND_RECOMMEND | ALWAYS | CONTEXT_MISSING |
| `RULE_TRIGGER.FROAD_VEHICLE_MISMATCH` | INTERVENTION | ALWAYS | CONTEXT_MISSING |
| `RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE` | EXPLAIN_AND_RECOMMEND | WHEN_HIGH_IMPACT | SILENT |
| `RULE_TRIGGER.LANDING_LONG_DRIVE` | COMPARE_OPTIONS | WHEN_HIGH_IMPACT | SILENT |
| `RULE_TRIGGER.RING_VS_SOUTH_SCOPE` | COMPARE_OPTIONS | ALWAYS | SILENT |
| `OPPORTUNITY.GLACIER_EXPERIENCE` | EXPLAIN_AND_RECOMMEND | WHEN_MATCHED | SILENT |
| `OPPORTUNITY.HIGH_IMPACT_EXPERIENCE` | COMPARE_OPTIONS | AFTER_GATE | SILENT |
| Canonical（无 Case） | EXPLAIN_ONLY | WHEN_HIGH_IMPACT | SILENT |
| `CANONICAL.SCHEDULE_CONFLICT`（午餐等） | EXPLAIN_AND_RECOMMEND* | WHEN_HIGH_IMPACT | 无已验证 Preview → `NO_VALIDATED_RECOMMENDATION` |

\* 推荐**仅当** `canRecommendOption` 通过；详见 [`GENERIC_CONFLICT_AI_POLICY.md`](./GENERIC_CONFLICT_AI_POLICY.md)。


接口字段：`requiredContext` / `hardRequired` / `aiMode` / `missingContextPolicy` / `proactiveMode` / `allowedActions` / `maxChineseChars` / `promptHint`。

---

## 三、最终判断（产品）

| 类型 | 行为 |
|------|------|
| 车型 / 保险 / 规则阻塞 | 主动解释（+ 推荐或干预） |
| 路线范围 / 落地长驾 | 解释取舍 |
| 冰川 / 高影响体验 | 高匹配才推荐，否则静默 |
| Canonical | 只翻译已有判断 |

统一顾问输出：`advisorCopy`（标题 / 说明 / 建议），前端加前缀 `Nara 判断：`。

查因：`evaluation.caseAiSemanticKey` / `caseAiMode` / `modeReason`（含 `CASE_PROACTIVE_HOLDS`）。
