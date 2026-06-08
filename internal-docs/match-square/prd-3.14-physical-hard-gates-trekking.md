# PRD 3.14 徒步场景体能硬约束与物理熔断规范

Decision OS · Match Square · Layer 0 Hard Gate  
**前置依赖**：§3.10 徒步 DNA 联动 · §3.13 拼团决策飞轮 · HumanCapabilityModel

---

## 1. 设计原则

在 Level 4+ 硬核徒步（冰岛兰格维格 55km 重装、川西贡嘎/长毕穿等）场景下，**体能错配直接关乎人命**。MBTI 互补、大厂背景对齐 **不得** 覆盖物理风控。

| 层级 | 名称 | 说明 |
|------|------|------|
| **Layer 0** | 物理熔断 | 爬升 / 海拔 / 重装 — 未达标 **隐性拦截**，申请不到达队长审批 |
| Layer 1 | Vibe Hard Gate | 学历 / 授信 / 预算 |
| Layer 2 | 组队风格 / MBTI | Soft Weights + 决策翻译 |

---

## 2. 体能等级自动分级（Physical Tiering Engine）

`config/physical-tier.config.ts` — Premium Trekking 剧本 SSOT：

| Level | 标签 | 剧本示例 |
|-------|------|----------|
| 1 | 城市休闲 | — |
| 2 | 轻装入门 | `weekend_fast_light_trek`, `light_trek_dyl_retreat` |
| 3 | 中级徒步 | （预留） |
| 4 | 重装进阶 | `iceland_laugavegur_heavy_trek`, `chuanxi_heavy_trek` |
| 5 | 极限远征 | （预留） |

**Level ≥ 4** 自动激活 Layer 0 物理熔断。

### 2.1 路线物理极值（示例）

| 剧本 | 单日爬升极值 | 最高海拔 | 重装 kg |
|------|-------------|----------|---------|
| 冰岛兰格维格 | 1400m | 1100m | 20 |
| 川西重装 | 1800m | 4700m | 22 |

硬拦截阈值：**申请人历史指标 ≥ 路线极值 × 80%**，且 Level 4 需 `heavyPackCampingVerified` 或负重达标。

---

## 3. 申请人特征矩阵（`trekking_fitness_baseline`）

持久化于 `user_travel_profile.extended_profile.trekking_fitness_baseline`：

```typescript
{
  maxDailyAscentM: number;
  maxAltitudeM: number;
  maxPackWeightKg: number;
  heavyPackCampingVerified: boolean;
  recentAerobicSessions30d: number;
  source: 'trip_history' | 'questionnaire' | 'default';
  evidenceLabel?: string; // 脱敏实证，如「2026-04 川西长毕穿 3 日重装」
}
```

数据来源（优先级）：行后 Trip 回流 → 体能问卷 → HumanCapabilityModel 投影 → 保守默认（Level 4 必拦）。

**未结构化数据时默认值**：爬升 400m / 海拔 600m / 无重装 — 城市休闲带宽。

---

## 4. 三维硬约束校验

### 4.1 历史最大负荷（Historical Load Baseline）

- 单日最大爬升、最高海拔、重装负重峰值
- 未达 80% → `canApply: false`，**不创建申请、不进入队长待审列表**

### 4.2 近期运动带宽（Recent Activity Frequency）

- `recentAerobicSessions30d` — 合规授权的有氧频次摘要
- `< 4`：审批透镜 **warn**；`= 0`：warn「燃尽僵尸牛马」风险（暂不单独 hard block，可迭代为 Level 5 拦截）

### 4.3 户外生存博弈题（Knowledge-Based Verification）

Level 4+ 申请时：

1. `GET .../apply-preview` 返回 `physicalSurvivalQuiz[]`（2 道）
2. `POST .../applications` 必传 `physicalSurvivalQuizAnswers: { [questionId]: optionId }`
3. 答错 → 400，不创建申请

题池：`config/trekking-survival-quiz.config.ts`

---

## 5. API 契约

### 5.1 申请预览

`GET /api/match-square/posts/:id/apply-preview`

新增字段：

```typescript
physicalFitnessGate?: {
  active: boolean;
  blocked: boolean;
  blockReason: string | null;
  routeTier: 1 | 2 | 3 | 4 | 5 | null;
  routeTierLabel: string | null;
  hardGateSummaryLine: string | null; // 🏃 体能门槛：Level 4 · 重装进阶
  hardGateHint: string | null;
  fitPercent: number | null;
  report: PhysicalFitnessFitReportView | null; // 通过时给拟合报告
};
physicalSurvivalQuiz?: Array<{ id; prompt; options: [{ id, label }] }>;
```

**校验顺序**：履约 Hard Gate → **Layer 0 物理** → Vibe 学历/授信 → 组队风格。

### 5.2 发帖 HARD GATES 外显

`post.vibeLlm.hardGatesSummary[]` 自动追加：

- `🏃 体能门槛：Level 4 · 重装进阶`
- `系统将自动拦截无重装/高海拔经验的申请者`（Level ≥ 4）

### 5.3 队长审批 — 体能拟合透镜

`GET .../applications?status=pending` 每条申请：

- `physicalFitnessReport` — 拟合度 %、数据实证、硬件复核 lines
- `decisionBrief.physicalFitnessReport` — 同构，供 3.13 卡片折叠

---

## 6. 行后负反馈回流（Post-Trip Fitness Feedback）

**已实现**：

| 能力 | 路径 |
|------|------|
| 基线合并 SSOT | `trekking-fitness-baseline.service.ts` — stored ∪ HumanCapability 问卷投影 |
| 降权引擎 | `engine/trekking-fitness-baseline.engine.ts` → `applyPhysicalFailurePenalty` |
| 行后回流 | `trekking-fitness-backflow.service.ts` |
| API | `POST /trips/:tripId/physical-fitness-events` |
| 协同任务联动 | `POST .../collaborative-tasks/:taskId/events` rollback + `fitnessSubjectUserId` |
| Decision DNA | `PreferenceEvolutionReason.TREK_PHYSICAL_FAILURE` |

事件类型：`route_rollback` · `mid_trip_evacuation` · `rescue_called` · `member_fitness_collapse`

持久化：`user_travel_profile.extended_profile.trekking_fitness_baseline` + `physical_fitness_events[]`（最近 20 条）


## 7. 代码落点

| 模块 | 路径 |
|------|------|
| 分级 SSOT | `config/physical-tier.config.ts` |
| 硬约束引擎 | `engine/physical-fitness-hard-gate.engine.ts` |
| 生存题池 | `config/trekking-survival-quiz.config.ts` |
| 基线读取 | `trekking-fitness-baseline.service.ts` + `util/trekking-fitness-baseline.util.ts` |
| 行后回流 | `trekking-fitness-backflow.service.ts` |
| 申请拦截 | `match-square.service.ts` → `getApplyPreview` / `createApplication` |
| HARD GATES 合并 | `util/vibe-post-view.util.ts` |
| 审批透镜 | `listPostApplications` + `decisionBrief` |

测试：`engine/physical-fitness-hard-gate.engine.spec.ts`

---

## 8. 与 §3.10 / §3.13 关系

- §3.10 提供 `recruitment_script_id` + `_trekkingOrchestration` → 触发 Level 4 _profile_
- §3.13 `decisionBrief` 叠加 **体能拟合报告**，不替代 Layer 0 拦截
- MBTI / 圈层 / 破冰化学反应均在 **物理通过后** 才参与排序

---

## 9. 验收清单

- [ ] 城市小白（默认 baseline）申请兰格维格 → preview `canApply: false`，无 pending 申请
- [ ] 重装老手（baseline 达标）→ preview 含 `physicalSurvivalQuiz`，提交需带答案
- [ ] 队长 Card HARD GATES 含体能门槛行
- [ ] 队长待审列表含 `physicalFitnessReport.fitPercent` 与 `evidenceLabel`
- [ ] 非 Premium Trekking 帖不受影响（`physicalFitnessGate.active: false`）
