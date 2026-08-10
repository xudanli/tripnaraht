# CGUS V1 — 运营验证期策略（冻结）

> **状态**：运营验证期（Operational Validation），非图 13 公式补齐期。  
> **当前 Sprint**：[`CGUS_V1_OPERATIONAL_VALIDATION_01.md`](./CGUS_V1_OPERATIONAL_VALIDATION_01.md) — Decision Outcome Loop。  
> **图 13**：设计参考，**不是**研发 Todo List。  
> **「公式没有完全实现」≠「现在应该补齐」。**

## 角色转变

| 过去 | 现在 |
|------|------|
| CGUS 有没有实现设计的决策算法？ | CGUS 在真实旅行里有没有帮助用户做出更好的决定？ |
| 架构 → 模型 → 公式 → 模块 | Trip → Decision → Choice → Outcome → Regret → Evidence → Fix |

CGUS 已从 **算法建设对象** 变为 **运营观察对象**。

## 冻结结论

**CGUS 搜索骨架、可行域投影、风险惩罚、期望效用聚合与选优主链已经满足 V1 真实 Trip 验证条件。**

EU-200 / EU-300 / EU-500 / L5 Weight Learning 记录为 **Known Gaps**，不因图 13 尚未完全实现而立项。

后续任何修改必须由真实 Trip 的 **错误排序、用户 override + 诊断证据、Decision Regret 或 Incident** 触发；无法对应真实证据时，**保持现状**。

> **`override ≠ failure`。** 仅 override + evidence + diagnosed root cause 才可进入研发。

## 模块冻结状态（对照图 13）

```
CGUS V1
──────────────────────────
EU-IN      RELEASED
EU-100     RELEASED
EU-200     FROZEN / EVIDENCE_REQUIRED
EU-300     FROZEN / EVIDENCE_REQUIRED
EU-400     RELEASED

EU-500
  Budget   KNOWN_GAP
  Time     EXISTING_MECHANISM / OBSERVE

EU-600     RELEASED

L5 → EU
  Weight Learning
  EXPERIMENTAL / NOT_AUTHORIZED

Outcome Loop
  OPS-01..03   IN PROGRESS / ACTIVE
```

| 模块 | 当前状态 | 现在是否开发 | 真正触发条件 |
|------|----------|--------------|--------------|
| EU-200 体验效用 | 简化 | **NO** | 重复 Wrong Ranking + `root_cause=UTILITY` + Experience under-valued + 现有机制无法修 |
| EU-300 哲学/覆盖评分 | 简化 | **NO** | 同上且定位为哲学/覆盖，且 Gate 无法解决 |
| EU-500 Budget Penalty | 返回 0 | **条件性** | 预算已是正式输入 + 明显错误方案 + override/regret + 根因 UTILITY（预算） |
| L5 → 动态权重 | 未接主链 | **坚决暂缓** | 多分项正确但排序持续错 + 根因反复 WEIGHT + 书面授权 |

## WeightLearner 边界（硬规则）

```
WeightLearner exists  ≠  WeightLearner should be activated
```

见 `cgus-v1-authorization.ts`。**V1 优先：确定性、可回放、可诊断 > 自适应。**

## 验证期研发范围

### 已完成

1. 冻结 scoring（不对齐图 13 重构）
2. 排序侧 Trace：`OptimizationHints.cgusDecisionTrace`

### 当前只做（Outcome Loop）

1. **OPS-CGUS-01** — `user_action` / `chosen_candidate` ✅ 契约 + HTTP + DSO
2. **OPS-CGUS-02** — `actual_outcome` / `decision_regret` ✅
3. **OPS-CGUS-03** — Trip Review Diagnosis ✅

入口：`GET/POST /decision/cgus/trip-review/...`（见 `CGUS_V1_OPERATIONAL_VALIDATION_01.md`）。  
**iOS 已接线**（`src/agent/delivery/CGUS_TRIP_REVIEW_IOS_HANDOFF.md`）。下一阶段以真实 Trip 灌数 + 运营 Diagnosis 为主，不改 CGUS 公式。

完成后进入：**除 Incident / 真实错误证据外不主动开发。**

## OUT OF SCOPE

× EU-200/300 公式扩展 × Budget optimization × Learned weight injection  
× 新候选生成策略 × CGUS 架构重构 × scoring redesign  

## 相关代码

- 授权：`cgus-v1-authorization.ts`
- Trace：`cgus-decision-trace.types.ts`
- 排序投影：`cgus-decision-trace.util.ts`
- Outcome 回写：`cgus-decision-outcome-loop.util.ts`
- Sprint：`CGUS_V1_OPERATIONAL_VALIDATION_01.md`
- 主链：`cgus-search.service.ts`
