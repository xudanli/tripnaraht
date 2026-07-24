# MOVE_DAY Design Review — S5 / M2 Gate（P3）

> **状态：DESIGN COMPLETE + P4.a Shadow MVP（2026-07-15）**  
> 实现：`python/solver/move_day_solver.py`（`OR_TOOLS_MOVE_DAY_SHADOW` 默认关）。  
> **禁止**在单日 Routing 上冒充；**未**权威晋升。

参考：
[ADR-008](../ADR-008-OR-Tools-Candidate-Provider.md) ·
[PLANNING_IR_FREEZE](./PLANNING_IR_FREEZE.md) ·
[研究报告 §路线生成层 / P2 多日](../../../docs/规划引擎与决策引擎研究报告.md) ·
Gold `hotel_change`（单日 proxy）

---

## 1. 判定摘要

| 问项 | 结论 |
|------|------|
| MOVE_DAY 是什么？ | **多日活动分配 / rebalance**（TDTOPTW 族），不是日内 Repair |
| 能否用现有单日 `RoutingModel` 冒充？ | **否**（已 reject：`operation∉MVP`、`scope.dayIds≠1`） |
| IR `@v1` 是否够用？ | Op 名已 reserved；**多日语义需字段扩展或 `@v2`**（见 §5） |
| 权威写路径？ | Shadow → Gateway → DecisionCore；**M4 前不权威** |
| P3 出门禁？ | 下方 **Design Checklist 全绿** 后开 P4 |

---

## 2. 问题定义（与 Repair 切割）

### 2.1 MOVE_DAY 负责

- 将 `canMoveDay=true` 的活动从 `dayA` 移到 `dayB`（可伴随日内序微调）
- 多日负载 / 节奏 rebalance（词典序或加权：日程满度、驾驶分钟、住宿锚距）
- 住宿锚变化触发的 **跨日重分配**（酒店换锚 ≠ 假 EDGE_FORBIDDEN）
- 输出 **多日** `dayPlans[]`（每日有序 nodeIds + 可选 startMin）

### 2.2 MOVE_DAY 不负责

| 能力 | 归属 |
|------|------|
| 同日 SHIFT / SWAP / REROUTE / SHORTEN / REPLACE | M1 Repair（已有） |
| 约束最终解释 / 风险裁决 / Plan Version 写入 | Decision Runtime |
| Continuous / Rolling Horizon | M4 后 |
| Native CP-SAT 编排内核 | M3（可选后端，非本评审前提） |

**命名纪律**：产品文案「挪到下一天」若仅触发同日 SHORTEN/SWAP，不得标 `operation=MOVE_DAY`。

---

## 3. 算法形态（选型）

推荐分层（与研究报告一致）：

```
Layer A — Day Assignment（集合划分 / TOP 变体）
   输入：活动集合、日集合、日容量、住宿锚、硬预约钉
   输出：dayId → {nodeIds}（无序或粗序）

Layer B — Intra-day Routing（现有单日 VRPTW）
   对每个受影响日跑 SHIFT/SWAP/REROUTE 管线
   nativeCpSat=false（除非 M3 真 CP-SAT）

Layer C — Local Repair deepen（可选）
   空/不可行日 → SHORTEN / REPLACE（仍 Shadow）
```

| 后端选项 | 适用 | 备注 |
|----------|------|------|
| **OR-Tools Routing 多车辆≈多日** | 首选 MVP | 车辆↔日；depot=住宿锚；需独立 travel 与容量维 |
| OR-Tools CP-SAT 分配 + Routing 排程 | 质量优先 | 属 M3 叠层；M2 可先不算 native |
| 纯启发式 bucket + 单日 Routing | 保底降级 | TIMEOUT 时降级；标 `PARTIAL` |

**明确否决**：把「删掉某节点再在同日矩阵里重排」标成 MOVE_DAY。

---

## 4. 住宿锚点与日容量

### 4.1 住宿锚（Hotel Anchor）

- 每 `dayId` 绑定 `anchorNodeId`（酒店 / 前夜住宿），`DEPOT_FIXED` **按日**
- 跨日边：`prevDay.anchor → nextDay.first` / `last → anchor` 进入跨日成本（可简化为日终回锚硬约束）
- Gold `hotel_change` 今日为 **单日 proxy**（陈旧 hop → `EDGE_FORBIDDEN`）；M2 金样必须升级为：
  - `scope.dayIds.length ≥ 2`
  - `operation=MOVE_DAY`
  - provenance 目标：`staging_replay` / `real_ops`

### 4.2 日容量（硬 / 软）

| 约束 | 建议 wire | MVP |
|------|-----------|-----|
| 最大驾驶分钟 / 日 | `MAX_DAY_DRIVE_MIN`（reserved → **implemented**） | 硬或高罚 |
| 最大活动数 / 服务分钟 | payload on day capacity dim | 硬 |
| Booked / FIXED_START | 节点字段（已有） | 钉死日 + 时刻 |
| `canMoveDay=false` | 节点字段 | 禁止跨日 |

---

## 5. Wire IR 演进（相对 Freeze `@v1`）

`@v1` **保持**：`MOVE_DAY` 仍 ERROR until M2 实现开关。

实现期二选一（P4 开工前锁定）：

| 方案 | 内容 | 推荐 |
|------|------|------|
| **A. `@v1` 兼容扩展** | `scope.dayIds[]` 多日；新增可选 `dayAnchors[]` / `dayCapacities[]`；candidates 多 `dayPlans` | ✅ 首选（非破坏） |
| **B. `@v2`** | 引入 `solverMeta.engine ∈ {routing\|cp_sat\|hybrid}` 一并做 | 与 M3 合并时再做 |

最小新增字段草案（方案 A）：

```ts
// SolverProblemScope 扩展（可选字段，单日路径忽略）
dayAnchors?: Array<{ dayId: string; anchorNodeId: string }>;
dayCapacities?: Array<{
  dayId: string;
  maxDriveMin?: number;
  maxServiceMin?: number;
  maxActivities?: number;
}>;

// SolverCandidateDiffHint 扩展
movedDayPairs?: Array<{ nodeId: string; fromDayId: string; toDayId: string }>;
```

响应：`candidates[].dayPlans` **长度 = 受影响日数（≥1）**；MOVE_DAY 成功时 ≥2 或明确 `movedDayPairs`。

Feature flag（建议）：`OR_TOOLS_MOVE_DAY_SHADOW=1` — 未开则保持 ERROR。

---

## 6. 主链集成（Shadow only）

```
Travel Context / Effective Plan / Evidence
  → projectMultiDaySolverProblem (NEW)
  → OR-Tools MOVE_DAY (+ per-day Routing)
  → SolverResponse.candidates (multi dayPlans)
  → Gateway.evaluateCandidate（逐日或整 TripPlan）
  → workspace / PlanProposal 附件（shadowAuthority:false）
  → DecisionCore.finalize（权威源仍 Neptune/legacy）
```

| 规则 | 说明 |
|------|------|
| Evidence stale | 复用 P2：`selectUsable*` + discard |
| Apply | **永不**直接写 MOVE_DAY shadow；须 RFC001 / proposal.changes 投影后经授权 |
| Projection | Canonical hotel/day-capacity → dayAnchors / capacities；不是反向 |
| RFC001 | 新增或映射 `MOVE_ITEM` across days / `MOVE_DAY` op kind（P4 定） |

---

## 7. Lab / Gold 验收（开 M4 前，先过 M2 Lab）

| 门 | 标准 |
|----|------|
| Reject 假路径 | 单日 + MOVE_DAY → ERROR（回归常开） |
| 跨日移动正确性 | `movedDayPairs` 与 dayPlans 成员一致；booked 不跨非法日 |
| Locality | 非全表打散：宜移动 **1–3** 活动（可配置）；禁止「全行程重分」冒充局部 MOVE_DAY |
| Stability | seed 固定，连续 ≥20（Lab）/ ≥100（签核） hash 一致 |
| Hotel gold | ≥5 条 `hotel_change` **多日** active（替换 proxy） |
| P95 | 多日规划目标对齐研究报：≤30s（M2 Lab 先定 50 POI / 5-day 档） |
| Authority | `writeAttempted=false`；Gateway 绕过 = 0 |

---

## 8. Design Checklist（P3 → P4 出门禁）

- [x] MOVE_DAY ≠ Repair 定义写死（本文 §2）
- [x] 否决单日 Routing 冒充（代码已拒 + 本文 §3）
- [x] 分层 A/B/C 算法形态选定（§3）
- [x] 住宿锚 + 日容量模型草图（§4）
- [x] IR 扩展方案（A 兼容 vs B `@v2`）注明（§5）— **P4 锁定 A**
- [x] Shadow 主链 + Evidence stale 复用（§6）
- [x] Lab / Gold 门（§7）
- [ ] 产品确认：局部 MOVE_DAY locality 上限与「允许全局 rebalance」意图开关
- [ ] 产品确认：住宿换锚是否强制同晚回锚
- [ ] P4 工时切片（建议 2 刀：赋值引擎 + 金样/主链挂接）

> 未勾产品项不阻塞设计评审关闭；**阻塞 P4 合并到主干 shadow flag 默认开启**。

---

## 9. P4 实施切片（预告，不在本 PR 做）

| Slice | 内容 | 出门 |
|-------|------|------|
| P4.a | Python：`MOVE_DAY` + `dayIds≥2` + flag；多车辆/分配 MVP | unit + lab_signoff 子集 |
| P4.b | Nest：`projectMultiDay…` + evaluate/planning 挂接（shadow） | evaluate 单测 |
| P4.c | Gold：`hotel_change` 多日 ≥5；replay MOVE_DAY | `lab:planning-gold` |
| P4.d | RFC001 / proposal 投影 + apply 隔离 | **DONE** — `ortools-move-day-projection.util.ts` |

---

## 10. Sign-off

| 项 | 值 |
|----|-----|
| Design owner | ADR-008 / Planning Engine |
| Authoritative promotion | **false** |
| P3 结果 | **COMPLETE — M2 设计开门** |
| 下一优先 | P4 实现（flag 默认关）或 M3 CP-SAT 并行调研 |
