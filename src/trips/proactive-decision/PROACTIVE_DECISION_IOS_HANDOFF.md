# Proactive Decision V1 — iOS / BFF 三层提醒卡对接（PD-6.7）

**状态：** Contract Freeze · Phase 5 ACTIVE — 体验验收 + Decision Dataset / Useful 反馈（不开新能力）  
**日期：** 2026-08-11  
**后端契约：** `nara.proactive_reminder_card@v1` · `nara.proactive_change_draft@v1` · `nara.proactive_l1_passive_banner@v1` · `nara.proactive_decision_dataset_record@v1`  
**代码：** `src/trips/proactive-decision/surface/` · `execution/` · `validation/`  
**冻结稿：** [Phase 4 Production Readiness](../../../internal-docs/product/PROACTIVE-DECISION-V1-PHASE4-PRODUCTION-READINESS.md) · [Phase 5 Validation](../../../internal-docs/product/PROACTIVE-DECISION-V1-PHASE5-VALIDATION.md) · [Shadow Checklist](../../../internal-docs/product/PROACTIVE-DECISION-V1-PHASE5-SHADOW-CHECKLIST.md)

**体验约束（Phase 4 / Phase 5）：**

1. 入口优先**执行首页 / 今日行程**，不以 Push 起家  
2. 用户文案只展示：发生了什么 → 为什么影响你 → 建议怎么办（**不展示三人格名**）  
3. Confirm 后回到 **Today's Plan**，不停留 AI 对话  
4. Shadow 阶段用户不可见；L2 仅 High Value Interrupt（未达则降级 L1 条带）  
5. **不再扩展 PD 功能面**；验收与 Decision Outcome 收集优先  

---

## 1. 何时展示

| Stage | 用户可见 | 形态 |
|---|---|---|
| **SHADOW** | 否 | 仅 `decisionTrace` / Shadow Log |
| **L1_PASSIVE** | 被动 | `l1PassiveBanner`（今日行程 / 执行首页条带） |
| **L2_IN_APP_INTERRUPT** | 打断（仅 High Value） | 三层 `reminderCard`；未达 High-Value → 降级 `l1PassiveBanner` |

共同条件：

1. `PROACTIVE_DECISION_V1_ENABLED=1`
2. Intervention gate = `NOTIFY_CARD`
3. Trip 命中 canary audience（allowlist 或 traffic%）

L1 文案固定入口：`Nara 发现一个可能影响行程的变化` → CTA「查看方案」。  
L1 **不**渲染三层打断卡（`shouldRenderCard=false`）。

---

## 2. 卡片载荷（BFF → Client）

```ts
type ProactiveReminderCardV1 = {
  schemaId: 'nara.proactive_reminder_card@v1';
  version: 1;
  tripId: string;
  caseId: 'CASE_CONTINUE_ACTIVITY' | 'CASE_REROUTE' | 'CASE_POSTPONE_ACTIVITY';
  decisionProblemId?: string;
  interventionCandidateId?: string;
  titleZh: string;
  layer1WhatHappenedZh: string;   // 发生了什么
  layer2WhatImpactedZh: string;   // 影响什么
  layer3SuggestionZh: string;     // Nara 建议
  layer3BenefitsZh: string[];
  recommendedOptionId: string;
  ctas: Array<{
    id: 'VIEW_OPTIONS' | 'DEFER' | 'WHY';
    labelZh: string;
  }>;
  whyPreviewZh: string;
};
```

### UI 映射（强制）

| 层 | 字段 | UI |
|---|---|---|
| 标题 | `titleZh` | 卡片标题 |
| L1 | `layer1WhatHappenedZh` | 发生了什么 |
| L2 | `layer2WhatImpactedZh` | 影响什么 |
| L3 | `layer3SuggestionZh` + `benefitsZh` | Nara 建议 + 收益点 |
| CTA | `ctas[]` | 查看调整方案 / 暂不调整 / 为什么？ |

L2（打断）仅在 `PROACTIVE_CANARY_STAGE=L2_IN_APP_INTERRUPT`；L1 为被动入口（如行程页横幅）。

---

## 3. CTA → 后端动作

| CTA | 客户端行为 | 后端结果 |
|---|---|---|
| `VIEW_OPTIONS` | 打开 Preview | Change Draft → `WAIT_CONFIRM`；展示 `change_draft` 卡 |
| `DEFER` | 关闭卡 | Draft → `DEFERRED`；进入冷却 |
| `WHY` | 展开解释 | 展示 `whyPreviewZh`（不改行程） |

`change_draft` 复用既有会话卡：

- `before_summary_zh` / `after_summary_zh`
- `apply_gate.can_apply`：Confirm 前为 `false`

---

## 4. Confirm → Apply（硬规则）

```text
禁止：Recommendation → 自动修改
必须：Preview → User Confirm → Apply(RFC001_FINALIZE)
```

- Confirm 前：`apply_gate.can_apply=false`
- Confirm 后：才允许调用 Apply（且需 `PROACTIVE_DECISION_CONFIRM_APPLY_WRITE_ENABLED=1`）
- Apply 路径：`POST .../execution/proactive-decision/apply` → RFC001 finalize → authorize → execute
- Push / AutoApply：**永不**由本卡触发

权威写链：ADR-012 → Guardian RFC-001 finalize（不是平行 Agent 写链）。

---

## 5. BFF 字段（已挂载）

### 读模型

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/mobile/trips/:tripId/execution/proactive-decision` | 专用表面 |
| GET | `/mobile/trips/:tripId/execution/adjustment-queue` | `proactiveDecisionV1` 字段一并返回 |

### CTA

| 方法 | 路径 | Body |
|---|---|---|
| POST | `.../execution/proactive-decision/cta` | `{ "cta": "VIEW_OPTIONS" \| "DEFER" \| "WHY" }` |
| POST | `.../execution/proactive-decision/confirm` | Confirm Draft（仍不 Apply） |
| POST | `.../execution/proactive-decision/apply` | Confirm 后 Apply（RFC001；需写链 flag） |
| POST | `.../execution/proactive-decision/impression` | Phase 5：`{ "surface": "L1_PASSIVE" \| "L2_INTERRUPT" }`（实际渲染后） |
| POST | `.../execution/proactive-decision/feedback` | Phase 5：`{ "useful": true \| false }` |
| GET | `.../execution/proactive-decision/validation` | Phase 5：Dataset + 指标 + Canary 晋级门禁 |

响应形状：

```json
{
  "schemaId": "tripnara.mobile_proactive_decision_surface@v1",
  "canaryStage": "L1_PASSIVE",
  "shouldRenderL1Passive": true,
  "shouldRenderCard": false,
  "l1PassiveBanner": {
    "titleZh": "Nara 发现一个可能影响行程的变化",
    "summaryZh": "附近风力预计增强",
    "cta": { "id": "VIEW_OPTIONS", "labelZh": "查看方案" }
  },
  "reminderCard": null,
  "changeDraft": { "...": "可点查看方案后 Confirm" },
  "decisionTrace": { "...": "解释层；勿展示人格名" },
  "flags": {
    "pushEnabled": false,
    "autoApplyEnabled": false,
    "confirmApplyWriteEnabled": false
  }
}
```

挂载点：

| 接口 | 字段 |
|---|---|
| `GET .../execution/overview-dashboard` | `proactiveL1Passive` |
| `GET .../today-itinerary`（或等价今日行程） | `proactiveL1Passive` |
| `GET .../execution/proactive-decision` | 完整 surface（含 L1/L2 标志） |

`decisionTrace` 在 **SHADOW 也可读**（可观测 / WHY）；客户端**禁止**把 abu/dre/neptune 名称展示给用户。

快照写入：天气/道路 pipeline 在 PD ingest 后落 `trip.metadata.proactiveDecisionV1Surface`。

Nest 服务：`MobileProactiveDecisionService` · `ProactiveDecisionSurfacePersistService` · `ProactiveRfc001ApplyAdapterService`。

---

## 6. 验收清单（Client）

- [ ] 三层文案完整展示，无叠加工具化 debug 字段
- [ ] 三 CTA 行为符合上表
- [ ] Shadow / 未入 canary 时不弹卡（`shouldRenderCard=false`）
- [ ] Confirm 前无法 Apply
- [ ] 无 Push 通道调用
- [ ] Phase 5：L1/L2 **实际渲染后**上报 `impression`（Accept 分母）
- [ ] Phase 5：L1/L2 可见后可提交 Useful / Not Useful（`feedback`）
- [ ] Phase 5：Shadow 不展示卡，但后台 Dataset 仍可写（客户端无感）
