# 冰岛 TEP 运营台账（试点期）

**状态：** W0 就绪 · 待 WP-TEP-16 签字后启用 W1 填数  
**关联：** [TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md) · [TEP-ICELAND-PILOT-TRIP-TEMPLATE.md](./TEP-ICELAND-PILOT-TRIP-TEMPLATE.md) · [TEP-PHASE0-SIGNOFF-CHECKLIST.md](./TEP-PHASE0-SIGNOFF-CHECKLIST.md)

---

## 1. 数据源台账

| 数据类型 | 来源 | 更新频率 | 证据有效期 | 降级策略 | 负责人 | 最近检查 |
|----------|------|----------|------------|----------|--------|----------|
| 道路状态 | Gagnaveita collector → WorldState `ROAD_SEGMENT` | ~15min cron | 按 assertion `validFor` | 无新鲜证据 → Hook 不触发 / NEED_CONFIRM | Ops/Eng | |
| 天气 | Vedur collector（Formal Soak 路径） | ~15min | 按 Vedur ingest 时间戳 | Open-Meteo fallback（不得覆盖 active Vedur risk） | Ops/Eng | |
| 日照 / 民用暮光 | Iceland pack `daylight-rules` + SDR-202 evaluator | 规划期静态；执行期 slip 重算 | 按行程日期 | 缺 DEM/坐标 → 规则降级 NEED_CONFIRM | Eng | |
| POI 营业信息 | 内部 POI 目录 + 规划期录入 | 手动/批量 | 规划快照 | REPLACE 仅预计算 POI；无运行时搜索 | Product | |
| 活动运营状态 | 行程 item + 天气敏感标记 | 规划期 | PlanVersion 快照 | SDR-302 仅对已标记 activity | Product | |
| 住宿 latest arrival | 规划约束 + SDR-203 | 规划期 | nightly stay 元数据 | 缺 latest arrival → 203 软提示 | Product | |

**Engineering 参考：** `TepRuntimePipelineBridgeService` · `WorldStateTepEvidenceService` · collector routes `/internal/evidence/weather/vedur` · `/internal/evidence/road/gagnaveita`

---

## 2. 规则质量台账（SDR）

| SDR | 触发次数 | 采纳率 | 误报率 | 漏报案例 | 修复成功率 | 证据来源 | 最近调整 |
|-----|----------|--------|--------|----------|------------|----------|----------|
| SDR-001 | | | | | | F-road / 车辆 | |
| SDR-002 | | | | | | 道路 WorldState | |
| SDR-101 | | | | | | DailyDrivePlan 负荷 | |
| SDR-201 | | | | | | 弹性节点 | |
| SDR-202 | | | | | | 日照 + slip | |
| SDR-203 | | | | | | 住宿可达 | |
| SDR-301 | | | | | | 道路 Hook | |
| SDR-302 | | | | | | 天气 + REPLACE | |
| SDR-303 | | | | | | 依赖链 | |

**W1 目标：** 每条 SDR 至少 1 次真实触发记录或明确「未触发」说明。

---

## 3. 试点行程登记

| 模板 ID | tripId | 阶段 | 天数 | 人数 | 路线 | 开始日期 | Owner | 反馈 |
|---------|--------|------|------|------|------|----------|-------|------|
| PILOT-IS-01 | `pilot_is_01` | 内部 | 5 | 2 | 南岸高负荷 | | Engineering | ⬜ |
| PILOT-IS-02 | `pilot_is_02` | 内部 | 7 | 2–4 | 环岛精简+道路 | | Engineering | ⬜ |
| PILOT-IS-03 | `pilot_is_03` | 内部 | 5 | 2 | 天气 REPLACE | | Engineering | ⬜ |
| PILOT-IS-04 | `pilot_is_04` | 内部 | 4 | 2 | 冬季 slip→日照 | | Engineering | ⬜ |
| PILOT-IS-05 | `pilot_is_05` | 内部 | 6 | 2 | 住宿可达 | | Engineering | ⬜ |
| PILOT-IS-06 | `pilot_is_06` | 内部 | — | — | 并发压测 | | Engineering | ⬜ |
| PILOT-IS-07 | `pilot_is_07` | 内部 | 5 | 2 | 2WD+F208 不可行 | | Engineering | ⬜ |
| PILOT-IS-08 | `pilot_is_08` | 内部 | 5 | 2 | 租车禁 F-road | | Engineering | ⬜ |
| PILOT-IS-09 | `pilot_is_09` | 内部 | 5 | 2 | 预约赶不上 | | Engineering | ⬜ |
| PILOT-IS-10 | `pilot_is_10` | 内部 | 5 | 2 | 道路证据过期 | | Engineering | ⬜ |

模板详情：[TEP-ICELAND-PILOT-TRIP-TEMPLATE.md](./TEP-ICELAND-PILOT-TRIP-TEMPLATE.md)

---

## 4. 试点指标汇总（按周）

| 周次 | 行程数 | DecisionProblem 数 | 采纳次数 | REMOVE | REPLACE | STALE | REPAIR_IN_PROGRESS | 回滚 | 用户价值访谈 |
|------|--------|-------------------|----------|--------|---------|-------|-------------------|------|--------------|
| W0 | — | — | — | — | — | — | — | — | 模板就绪 |
| W1 | | | | | | | | | |

### 4.1 感知质量

- 真实事件捕获率：_
- 无效事件率：_
- Hook 提前量（中位数）：_

### 4.2 判断质量

- 「确实影响行程」认同率：_
- 重复卡片次数：_
- 漏报案例数：_

### 4.3 决策质量

- 修复建议采纳率：_
- 手动修改率：_
- 主要拒绝原因：_

### 4.4 执行质量

- 写回成功率：_
- 修复后重新可执行率：_
- 幂等 replay 次数：_
- 并发 coalesce 次数（401-CONCURRENT 类）：_

### 4.5 用户价值

- 是否更早发现问题（是/否/部分）：_
- 是否减少临时搜索：_
- 付费意愿（金额区间）：_

---

## 5. 真实事件案例库

| 案例 ID | 日期 | 类型 | tripId | 摘要 | Hook / SDR | 用户动作 | 结果 | 资产链接 |
|---------|------|------|--------|------|------------|----------|------|----------|
| ICE-001 | | 道路关闭 | | | SDR-002 / 301 | | | |
| ICE-002 | | 强风 | | | SDR-302 | | | |
| ICE-003 | | 晚出发 | | | SDR-202 / slip | | | |
| ICE-004 | | 活动取消 | | | | | | |
| ICE-005 | | 酒店晚到 | | | SDR-203 | | | |
| ICE-006 | | 路线高负荷 | | | SDR-101 | | | |
| ICE-007 | | F-road 车辆冲突 | | | SDR-001 | | | |

案例 JSON / 截图存放：`internal-docs/operations/evidence/tep-pilot/`  
反馈表模板：见 [PILOT-TRIP-TEMPLATE §3](./TEP-ICELAND-PILOT-TRIP-TEMPLATE.md)

---

## 6. 新西兰迁移门槛追踪

| 条件 | 目标 | 当前 |
|------|------|------|
| 真实行程 | ≥20 | 0 |
| DecisionProblem | ≥30 | 0 |
| 用户采纳修复 | ≥10 | 0 |
| REMOVE 真实成功 | ≥1 | 0 |
| REPLACE 真实成功 | ≥1 | 0 |
| 误报/重复可控 | 评审通过 | — |
| Hook 生命周期稳定 | 评审通过 | — |
| 写回并发门禁 | 完成 | ✅ WP-TEP-17 |

---

## 7. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-13 | W0：数据源预填、PILOT-IS-01～08 登记槽、W1 指标列扩展 |
| 2026-07-12 | 初版模板 |
