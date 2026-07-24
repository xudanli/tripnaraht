# 通用日程冲突（午餐时间窗等）— Copilot 策略

**结论：** 此类页面**不能**仅靠优化提示词上线。AI 推荐必须与页面事实同源，且通过 Preview/Validate 门禁。

契约：[`generic-conflict-ai.ts`](./contracts/generic-conflict-ai.ts) · Case：`CANONICAL.SCHEDULE_CONFLICT`

---

## 提示词（服务端注入）

见 `GENERIC_CONFLICT_ADVISOR_PROMPT`：最多 55 字；推荐必须来自已验证方案；不一致 → `DATA_CONFLICT`；无推荐 → 只解释冲突。

推荐输出形状：

```json
{ "explanation": "上一活动将延迟至12:30，占用原午餐时间。", "suggestion": "午餐后移30分钟，对后续安排影响最小。" }
```

映射到 `advisorCopy.body` / `advisorCopy.advice`。

---

## 推荐门禁

```ts
canRecommendOption(problem, option, preview) ===
  preview.problemId === problem.id &&
  preview.resolved === true &&
  preview.remainingBlockingIssues.length === 0 &&
  preview.planVersion === problem.planVersion // 双方皆有时
```

无任何选项通过：

```json
{
  "mode": "ATTENTION",
  "modeReason": "NO_VALIDATED_RECOMMENDATION",
  "explanation": "当前冲突仍未找到可验证的修复方案。",
  "recommendation": null
}
```

时间事实与推荐时钟不一致 → `modeReason=DATA_CONFLICT`。

evaluate 时 Context Builder 对候选 option 调 Gateway `previewOption`（最多 4 个、单次超时 2.5s），经 `toRecommendGatePreview` 注入 `validatedPreviews`。门禁 `canRecommendOption` 通过后才放行推荐；否则 `NO_VALIDATED_RECOMMENDATION`。

查因：`evaluation.validatedPreviewCount` / `validatedResolvedCount`。

---

## 建议页面结构

```
午餐时间冲突
上一活动预计延迟至 12:30

Nara 建议
{advisorCopy.body}
{advisorCopy.advice}
[查看方案影响]

可选方案
○ …
```

- 标题只保留一次；「待决策」卡与页标题合并，避免同题重复。  
- 分组仍用「其他 / 规划问题」（无 `decisionCase`），**不要**塞进 MUST_CONFIRM 三组。

---

## 当前优先修复顺序（产品/工程）

1. **核对**页面上 17:00 与 12:00 / 12:30 等字段含义（同一 problemRef 的事实时钟）。  
2. **验证**「后移 30 分钟」是否真的消除冲突（Preview/Validate）。  
3. **检查器与决策卡读取同一个 problemRef**（与 Copilot `selectedRefs` / Gateway `problemId` 对齐）。  
4. **最后**再压缩 Nara 文案。

在 1–3 未完成前，Copilot 应返回 `NO_VALIDATED_RECOMMENDATION` 或 `DATA_CONFLICT`，而不是给出看似笃定的错误推荐。
