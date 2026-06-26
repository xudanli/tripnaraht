# 专利 6.5（步骤 1–12）对齐差距清单与 PR 切片

> 审查基准：专利实施例「新西兰 5 天自驾（奥克兰→皇后镇→米尔福德）」  
> 当前工程完成度：**~75–80%**（主链路可跑，实施例 JSON/阶段语义未 1:1）

---

## P0 差距（专利答辩阻断项）

| ID | 专利要求 | 现状 | 目标 |
|----|----------|------|------|
| G-01 | 步骤 1：`environmentState.particles` 均匀先验 | 粒子在 RESEARCH 才生成，存于 `beliefSamples` | 提供映射视图 + 可选同步 |
| G-02 | 步骤 3：粒子变量 `{weather_day3, road_milford, cost}` | `environmentSummary.weatherRisk` 等标量 | `patent-environment-particles.mapper` |
| G-03 | 步骤 6：PLAN_GEN 多候选 + IG 过滤 | 单 itinerary；IG 在 OPTIMIZE/CGUS | `plan-gen-candidate-pool` + 写入 `candidates` |
| G-04 | 步骤 12：满意度驱动在线学习 | RLHF 采集为主，参数写回弱 | FEEDBACK 写回 preference 权重（待 PR-4） |
| G-05 | 端到端 golden path | 无 NZ 5 天固定回归 | `scripts/replay-patent-nz-5day.ts` |

---

## P1 差距（可辩护但需文档/测试补强）

| ID | 说明 | 处理 |
|----|------|------|
| G-06 | `userIntent.userAge` vs `party.fitnessLevel` 字段名 | 映射表 + INTAKE normalizer |
| G-07 | `narrative.title` vs `user_friendly_summary` | 导出 adapter（NARRATE 不改 schema） |
| G-08 | Lyapunov 用 DSO 一致性，非满意度 Uk | 双轨：`DSOStabilityMonitor` + `evaluate-lyapunov.ts` 文档说明 |
| G-09 | β=0.4 在 CONTEXT_BUILD 输出 | 写入 `uncertaintyProfile` 审计字段（PR-4） |

---

## PR 切片（按合并顺序）

### PR-1：`patent-environment-particles` 映射层 ✅ 本分支

**范围**

- `src/decision/kernel/patent/patent-environment-particles.mapper.ts`
- `src/decision/kernel/patent/patent-environment-particles.mapper.spec.ts`
- RESEARCH 可选：`DECISION_OS_PATENT_PARTICLES_VIEW=1` → 写入 `environmentState.patentParticlesView`

**验收**

```bash
npm test -- --testPathPatterns=patent-environment-particles.mapper
```

**不改动**：现有 `beliefSamples` 存储（向后兼容）。

---

### PR-2：`plan-gen-candidate-pool` 多候选壳层 ✅ 本分支

**范围**

- `src/decision/kernel/patent/plan-gen-candidate-pool.util.ts`
- `src/decision/kernel/patent/plan-gen-candidate-pool.util.spec.ts`
- `executePlanGen`：`DECISION_OS_PATENT_PLAN_GEN_CANDIDATES=1` → 填充 `DSO.candidates`，`planDraft` 仍为首选 itinerary

**验收**

```bash
npm test -- --testPathPatterns=plan-gen-candidate-pool
```

**专利对齐说明**：步骤 6 的 IG 排序在本 PR 为**轻量启发式**；完整 IG 仍由 OPTIMIZE/CGUS 承担（权利要求可表述为「PLAN_GEN 产出候选池，OPTIMIZE 完成效用+IG 终选」）。

---

### PR-3：NZ 5 天 E2E replay ✅ 本分支

**范围**

- `scripts/replay-patent-nz-5day.ts`
- `npm run test:patent-nz-5day`

**模式**

- 默认：**离线 mock**（无 DB、无 LLM），验证专利 JSON 形状与关键数值容差
- 可选：`PATENT_NZ_FULL_KERNEL=1` 走 Nest + Kernel 阶段（需 API keys / DB）

**验收**

```bash
npm run test:patent-nz-5day
# 期望：✅ 12 步结构检查 PASS（mock 模式）
```

---

### PR-4：FEEDBACK 在线学习 + 字段 normalizer ✅ 本分支

**范围**

- `patent-intake-normalizer.util.ts` — 年龄 → `daily_walk` / `drive_time` 种子
- `patent-gate-constraints.util.ts` — GATE_EVAL 专利扩展字段
- `patent-feedback-learning.util.ts` — 满意度 → 偏好权重 + Lyapunov 审计
- `UncertaintyProfile.explorationBeta` — RESEARCH 元决策审计
- `executeFeedback` / `orchestratorStateToDecisionStatePatch` / `GateEvalExecutor` 接线

**开关**

```bash
export DECISION_OS_PATENT_INTAKE_NORMALIZER=1
export DECISION_OS_PATENT_GATE_CONSTRAINTS=1
export DECISION_OS_PATENT_FEEDBACK_LEARNING=1
```

**验收**

```bash
npm run test:patent-kernel-patent
npm run test:patent-nz-5day
```

---

### PR-4（原待做项）— 已合并至上方 ✅

---

## 字段映射速查（工程 ↔ 专利）

| 专利字段 | 工程字段 |
|----------|----------|
| `environmentState.particles[]` | `beliefSamples[]` → mapper → `patentParticlesView` |
| `environmentState.particles[].weather_day3` | `environmentSummary.weatherRisk` + day index |
| `environmentState.particles[].road_milford` | `roadConditions.milford_closure_prob` 或 proxy |
| `tripState.planDraft[]`（多方案） | `candidates[]` + 单一 `tripState.planDraft` |
| `optimizationHints.selectedPlanId` | CGUS `recommended.id` |
| `DSO.history[]` | `StateHistoryDelta[]` on commit |
| `decision_log[]` | `OrchestratorState.decision_log` |
| `feedback.satisfactionScore` | `DecisionStateFeedback.satisfactionScore` |

---

## 合并后专利主张建议措辞

1. **粒子信念**：本系统以 `beliefSamples` 实现离散粒子滤波；对外专利视图经 `patentParticlesView` 投影，语义等价于权利要求中的 `environmentState.particles`。
2. **多候选规划**：PLAN_GEN 阶段写入 `candidates` 候选池；OPTIMIZE 阶段 CGUS 基于统一效用函数与信息增益完成终选。
3. **并发更新**：`pushDelta` + commit window + `STAGE_PRIORITY` 实现乐观锁与阶段优先级合并（步骤 7 已覆盖）。

---

## Test plan（PR-1~4 合并前）

- [x] `patent-environment-particles.mapper.spec.ts` 全绿
- [x] `plan-gen-candidate-pool.util.spec.ts` 全绿
- [x] `patent-intake-normalizer` / `patent-gate-constraints` / `patent-feedback-learning` 全绿
- [x] `npm run test:patent-nz-5day` mock 模式 PASS
- [ ] `npm run test:concurrent-delta` 仍 PASS（步骤 7 无回归，合并前建议跑）
- [x] 默认不开 flag 时行为不变（`DECISION_OS_PATENT_*` 未设置）

---

## 建议 Git 分支拆分（4 个 PR）

| 分支 | 文件范围 | 标题建议 |
|------|----------|----------|
| `patent/pr-1-particles-view` | `patent-environment-particles.*` + RESEARCH 接线 | feat(kernel): patent particles view mapper |
| `patent/pr-2-plan-gen-candidates` | `plan-gen-candidate-pool.*` + PLAN_GEN 接线 | feat(kernel): PLAN_GEN multi-candidate pool |
| `patent/pr-3-nz-replay` | `scripts/replay-patent-nz-5day.ts` + npm scripts + `.pr/` | test: patent 6.5 NZ 5-day mock replay |
| `patent/pr-4-feedback-learning` | PR-4 utils + gate/intake/feedback 接线 + `explorationBeta` | feat(kernel): patent feedback learning & intake seeds |

**一键启用（联调/答辩）**

已写入项目根目录 `.env`（Nest `ConfigModule` 自动加载）。模板见 `.env.patent-6.5.example`。

```bash
# 当前终端（不重启 dev 时）
source scripts/setup-patent-6.5-env.sh

# 或带专利 flag 启动 dev
npm run dev:patent
```

```bash
export DECISION_OS_PATENT_PARTICLES_VIEW=1
export DECISION_OS_PATENT_PLAN_GEN_CANDIDATES=1
export DECISION_OS_PATENT_INTAKE_NORMALIZER=1
export DECISION_OS_PATENT_GATE_CONSTRAINTS=1
export DECISION_OS_PATENT_FEEDBACK_LEARNING=1
```
