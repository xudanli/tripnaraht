---
name: cgus-engineering
description: >-
  开发、评审与扩展 TripNARA CGUS（Constraint-Guided Utility Search）栈：
  五步流程（可行域投影、效用先验、不确定性采样、世界模型推演、最优选择）、
  与 ObjectiveFunction 对齐的 Monte Carlo、概率世界模型、Abu/CGUS 搜索与
  replay/e2e 套件。在用户或任务涉及 CGUS、candidate ranking、E[U]、
  feasibilityProbability、cgus-search、probabilistic world、
  optimization 模块或 scripts/replay-cgus-suite / test-optimize-cgus 时使用。
---

# CGUS 工程（TripNARA）

**快捷唤起**：在 Agent 中输入 **`/cgus`**（短名 Skill，`.cursor/capabilities/cgus/`，仅显式调用时注入上下文）。

## V1 运营验证期（必读）

**图 13 是设计参考，不是研发 Todo。** CGUS 已是 **运营观察对象**，不是算法建设对象。

冻结结论与模块状态见：

`src/trips/decision/optimization/CGUS_V1_OPERATIONAL_POLICY.md`

当前 Sprint（**不是** Phase 3）：

`src/trips/decision/optimization/CGUS_V1_OPERATIONAL_VALIDATION_01.md`

- 主链 RELEASED → 真 Trip 验证。
- **只做** Decision Outcome Loop：Action / Outcome+Regret / Trip Review Diagnosis。
- EU-200/300 FROZEN；Budget KNOWN_GAP；L5 NOT_AUTHORIZED。
- **`override ≠ failure`**；解冻公式须重复证据 + 诊断根因。

**OUT OF SCOPE**：EU 公式扩展、预算优化、学得权重注入、架构重构、scoring redesign。

## 团队构成（建议）

小型核心 **5–7 人** 即可覆盖全链路；角色可合并，但下列能力域需有人负责。

| 角色 | 职责域 | 本仓库主要落点 |
|------|--------|----------------|
| **CGUS / 优化负责人** | CGUS 五步编排、候选排序、与 Abu / 策略编排的接口 | `cgus-search.service.ts`、`abu-optimizer.service.ts`、`strategy-orchestrator*.ts`、`optimization.module.ts` |
| **概率与期望效用** | `fromDeterministicModel`、采样分布、MC 预算、与确定性目标对齐 | `probabilistic-world-model.*`、`expected-utility.service.ts`、`MonteCarloConfig.deterministicWorld` |
| **目标函数与约束** | 八维分解、硬软约束、与 MC breakdown 语义一致 | `objective-function.service.ts`、`objective-function.interface.ts` |
| **决策内核集成** | DSO → 世界上下文、Hints、OPTIMIZE 路径 | `decision/kernel/*`、`optimization-engine-adapter.service.ts`、`dso-to-*-converter*.ts` |
| **评测与回放** | Golden、e2e、契约、artifact 报告 | `trips/decision/evaluation/*`、`scripts/replay-cgus-suite.ts`、`scripts/cgus-cli.ts`、`scripts/test-optimize-cgus.ts` |
| **后端平台** | Nest 模块边界、用户 API（如 risk-assessment）、可观测性 | `controllers/user/optimization-user.controller.ts`、`negotiate-context-loader.service.ts` |

**协作习惯**：改 MC 或 `dimensionExpectations` 时，必须同步核对与 `ObjectiveFunctionService.evaluate` 的 breakdown；改 CGUS 排名逻辑时，跑相关 `*.spec.ts` 与（若可）`replay-cgus-suite` 或 `test-optimize-cgus` 的最小用例。

## 代码地图（必读路径）

1. **V1 运营策略 / Outcome Loop**：`CGUS_V1_OPERATIONAL_POLICY.md`、`CGUS_V1_OPERATIONAL_VALIDATION_01.md`、`cgus-v1-authorization.ts`、`cgus-decision-trace.types.ts`、`cgus-decision-outcome-loop.util.ts`；OPTIMIZE 出站 `OptimizationHints.cgusDecisionTrace`。
2. **入口与配置**：`optimization.module.ts`、`decision-os.module` / `DecisionOSConfigService`（若涉及开关）。
3. **CGUS 五步**：`cgus-search.service.ts`（含 `utilityBreakdown`）— **冻结评分，验证期不改公式**。
4. **MC 与确定性对齐**：`expected-utility.service.ts`；仅 Incident/证据触发时改动。
5. **评测**：`cgus-replay.module.ts`、`cgus-replay-suite.util.ts`、`e2e-replay*.ts`。

## 实现原则

- **单一事实来源**：标量效用以 `ObjectiveFunctionService` 的维度分解为准；MC 在提供 `deterministicWorld` 时必须走 `evaluate` + 调用方 `weights` 重算总效用，避免与启发式 `evaluatePlanWithSample` 漂移。
- **小步可验证**：改采样或权重时，优先加/改单元测试，再补一条 replay 或脚本用例。
- **不扩大范围**：无关模块（例如纯 UI、无关 trips 域）不要随 CGUS PR 顺带大改。

## PR / 自检清单

- [ ] 若动 MC：`deterministicWorld` 路径与启发式路径行为是否仍符合调用场景（API / adapter / CGUS 是否已传 world）。
- [ ] `objective-function` 或约束变更：是否影响 `isFeasible` 与 `feasibilityProbability` 语义。
- [ ] 新候选特征或 world 字段：`NegotiateContextLoader` / `dsoToMinimalWorldModelContext` 是否需同步，避免「确定性有坐标、MC 世界缺字段」类问题。
- [ ] 相关 `jest` 与（若适用）`npx ts-node scripts/replay-cgus-suite.ts` 或 `test-optimize-cgus` 已执行且无回归说明。

## 与 Harness / Agent 栈的关系

Harness 步骤契约与 trace 见 `harness-runtime` skill 与 `docs/Harness Runtime.md`。CGUS 属于 **决策/优化子系统**：不得绕过 Gate 或 DSO 写状态；若 PR 同时碰 Harness 与 CGUS，拆成两个提交或明确两段描述以便评审。

## 相邻主线 Skill（五线全景）

- **编排执行**：`orchestration-mainline`
- **决策内核**：`decision-kernel-engineering`
- **优化与候选搜索（全景）**：`optimization-candidate-search`（本 Skill 为其中 CGUS/MC 专精）
- **VERIFY**：`verify-mainline`
- **回放与评估**：`replay-evaluation`

## 扩展阅读（按需打开）

- **CGUS 官方基线与晋升 / 门禁语义**：`baselines/cgus/README.md`；**基线更新策略（禁止「比不过就换基线」）**：`baselines/cgus/BASELINE_UPDATE_POLICY.md`；**基线 PR 标题 CI**：`scripts/check-baseline-pr-title.ts`、`.github/workflows/baseline-pr-title.yml`、`npm run check:baseline-pr-title`；**PR 标题/正文示例唯一源 + 格式版本**：`scripts/lib/baseline-pr-compliance.examples.ts`（`BASELINE_PR_EXAMPLE_SCHEMA_VERSION`，CI stderr `Example schema:`）。
- 专利/设计叙述：`docs/Decision_OS_技术交底书.md`（若存在）中与 CGUS、3.6.x、Monte Carlo 相关章节。
- 角色路由（人机协作）：`.claude/role-router.md`（与架构师、内核、QA 的接口约定）。
- **工程小队提示词与 role-router 映射**：`decision-platform-roles` Skill（`prompts-engineering-squads.md`、`reference-role-mapping.md`）。
