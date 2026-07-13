# 冰岛自驾 TEP Phase 0 — Limited Pilot 运营手册

**状态：** 战略 SSOT（工程 → 产品 → 试点） · **版本：** 1.0.0 · **2026-07-12**  
**前置：** [TEP-PHASE0-CONTRACT-FREEZE.md](./TEP-PHASE0-CONTRACT-FREEZE.md) · [TEP-PHASE0-STATUS.md](./TEP-PHASE0-STATUS.md)

---

## 0. 定位转变

TEP Phase 0 **不再是「继续补功能的研发项目」**，正式转为三个用途：

| 用途 | 说明 |
|------|------|
| **产品核心能力** | TripNARA 自驾可执行规划 + 行程运行保障的差异化基础 |
| **真实用户试点系统** | 在真实冰岛行程中验证闭环是否有价值 |
| **跨目的地复制基线** | 新西兰等迁移时验证 TEP Core 未被冰岛逻辑污染 |

**下一阶段工程目标已从「能不能跑通闭环」转为：**

> 闭环在真实世界里是否准确、稳定、有用，并值得付费。

---

## 1. 发布状态阶梯

| 状态 | 含义 | 当前 |
|------|------|------|
| Functional Complete | 主链可运行，认证通过 | ✅ |
| **Production Candidate — Limited Pilot** | 契约签字 + 写回并发门禁完成；可受控试点 | 🎯 目标 |
| Production Ready | 试点指标达标 + 运营台账稳定 | 未达 |
| General Availability | 公开发布冰岛自驾 | 未达 |

**不得**在 Limited Pilot 前对外宣称 Production Ready。

---

## 2. 进入试点前的两个收尾动作

### 2.1 WP-TEP-16 正式签字（立即）

**最低成本、最高确定性。** 签字对象：

| 角色 | 确认内容（非「无 Bug」） |
|------|-------------------------|
| 产品负责人 | Phase 0 支持范围、收费边界、试点指标、对外表述 |
| 后端/架构负责人 | Hook/RecoveryGraph 契约、写回/幂等/STALE、已知技术缺口 |
| Mobile/Web 消费方 | BFF 返回结构、`intervention-tep-*` 交互、Executability 状态展示 |

**冻结项：** 见 [TEP-PHASE0-CONTRACT-FREEZE.md](./TEP-PHASE0-CONTRACT-FREEZE.md) §1–§7 + 已知缺口清单。  
**执行 Checklist：** [TEP-PHASE0-SIGNOFF-CHECKLIST.md](./TEP-PHASE0-SIGNOFF-CHECKLIST.md)  
**约束 UI 白名单：** [CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md](./CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md) — 31 模板 ≠ 31 enforce；Phase 0 不得按 `type===HARD` 过度承诺。

**签完后状态改为：** `Production Candidate — Limited Pilot`（不是 Production Ready）。

### 2.2 分布式写回并发门禁 ✅（2026-07-13）

当前：`TepLocalRepairApplyService` 已接入 **L0 进程内 dedupe + L1 advisory lock + L2 `tep_repair_executions` 表**；staging PG IS-CERT-401/401-CONCURRENT/402 通过。

多实例部署时，同一 `(tripId, optionId)` 至多一次有效写回；并发第二请求 coalesce 或 replay。

**规格：** [TEP-WRITE-CONCURRENCY-GATE.md](./TEP-WRITE-CONCURRENCY-GATE.md)

完成 2.1 + 2.2 → 可进入 **受控试点**（**2.2 技术项已完成；2.1 签字仍待**）。

### 2.3 工程 Fixture（PILOT-IS-01～04）✅

内部试点行程可通过脚本一键写入 staging/local（**禁止 production DB**）：

```bash
# 写入四条模板行程（01 REMOVE / 02 道路 / 03 REPLACE / 04 slip→日照）
npm run tep:pilot-seed -- --template=all --reset

# 写回冒烟（staging PG）
npm run tep:pilot-smoke              # PILOT-IS-01 REMOVE
npm run tep:pilot-smoke-all          # 01 + 03（需先 seed --reset）

# 运行时 Hook 冒烟（02 道路 / 03 天气 / 04 slip→日照 + REMOVE）
npm run tep:pilot-runtime-smoke -- --template=02
npm run tep:pilot-runtime-smoke -- --template=03
npm run tep:pilot-runtime-smoke -- --template=04
npm run tep:pilot-runtime-smoke      # 02 + 03 + 04

# CI 一键（需 DATABASE_URL，拒绝 prod）
npm run tep:pilot-ci
```

| tripId | 模板 | 认证对照 | 规划期 / 运行时 |
|--------|------|----------|-----------------|
| `pilot_is_01` | 高负荷 REMOVE | IS-CERT-302 | 规划期 `REQUIRES_REPAIR` |
| `pilot_is_02` | F208 道路 | IS-CERT-301 | 需注入 `road.status=CLOSED` |
| `pilot_is_03` | 海岸 REPLACE | IS-CERT-303 | 需注入强风；smoke 测 REPLACE 写回 |
| `pilot_is_04` | 冬季 slip | IS-CERT-405 | 见 `metadata.tepPilotRuntimeHints` |

行程卡详情：[TEP-ICELAND-PILOT-TRIP-TEMPLATE.md](./TEP-ICELAND-PILOT-TRIP-TEMPLATE.md)

---

## 3. 三种「用法」

### 用法 A — 黄金产品演示（5–8 分钟）

**固定场景：冰岛 Day 3**

1. 用户已有自驾计划 → 系统显示 **可执行**
2. 展示：驾驶负荷、日照窗口、住宿可达、天气敏感活动
3. 模拟晚出发 90 分钟
4. TEP 判断：路段将越过日照窗口；住宿晚到风险
5. `adjustment-queue` 出现待调整项（发生了什么 / 影响 / REMOVE 或 REPLACE）
6. 用户采用 → 时间轴更新 → 新 PlanVersion → **EXECUTABLE**

**用途统一：** 投资人、合作伙伴、潜在用户、新成员 onboarding、新目的地迁移验收。

### 用法 B — 小规模真实行程试点

**目的地：** 仅冰岛自驾 · 5–10 天 · 2–4 人 · 南岸或环岛常规路线 · 有住宿 + 固定活动 · 愿意反馈。

| 阶段 | 行程数 | 目标 |
|------|--------|------|
| 内部测试 | 5–10 | 数据、投影、交互问题 |
| 邀请制试点 | 20–30 | 提醒与修复是否有用 |
| 付费试点 | 50–100 | 付费意愿与服务成本 |

**不要**一开始公开发布给所有冰岛用户。

### 用法 C — 收费产品核心

| 产品 | 交付 | 收费逻辑 |
|------|------|----------|
| **A：自驾可执行规划** | 路线 + 负荷 + 道路准入 + 日照/住宿 + 活动窗 + 可恢复性设计 | 规划费 |
| **B：行程运行保障** | 道路/天气/日照/执行偏差监测 → 影响判断 → 待调整项 → REMOVE/REPLACE → 重验证 | 持续监测费（差异化核心） |

智能助手作为交互入口包含在 B 中，不必单独拆 SKU。

---

## 4. 试点必记指标

### 4.1 感知质量

- 真实事件捕获率、无效事件率、证据过期率
- Hook 提前量、事件 → DecisionProblem 延迟

### 4.2 判断质量

- 用户认为「确实影响行程」的比例
- 风险等级准确度、影响范围完整性
- 重复卡片 / 漏报关键影响

### 4.3 决策质量

- 修复建议采纳率（REMOVE / REPLACE 分项）
- 用户手动修改率、拒绝原因

### 4.4 执行质量

- 修复后重新可执行率、写回成功率
- STALE 命中率、幂等 replay 次数、回滚次数
- 修复后是否产生新问题

### 4.5 用户价值（最关键）

- 是否比用户更早发现问题
- 是否减少临时搜索与讨论
- 是否避免取消、晚到、绕路
- **是否愿意为一趟行程付费 / 愿意付多少**

台账模板：[TEP-ICELAND-OPERATIONS-LEDGER.md](./TEP-ICELAND-OPERATIONS-LEDGER.md)  
行程模板：[TEP-ICELAND-PILOT-TRIP-TEMPLATE.md](./TEP-ICELAND-PILOT-TRIP-TEMPLATE.md)

---

## 5. 暂缓项：SDR-102 / SDR-103

连续驾驶、多日疲劳**不是当前优先级**。

**触发条件（满足后再做）：**

- 真实试点中反复出现驾驶疲劳
- 用户明确反馈现有 SDR-101 负荷不足
- 能稳定获得实际出发/抵达/驾驶数据
- `DailyDrivePlan` 可稳定跨日累计

**先回答：** 已有 ~10 条规则 + 修复闭环，用户是否真的会采纳？

---

## 6. 产品页面收敛（TEP 为主逻辑）

### 规划阶段 — 回答「能不能执行？」

展示：总体状态、主要阻断、需确认事项、高负荷日、日照风险、住宿可达、可恢复能力、**哪一天最脆弱**。

示例：

> Day 4 · 高风险 · 驾驶负荷高 · 弹性节点 0 · 天气敏感活动 1 · 最晚出发 09:20  
> 调整什么可以恢复？→ 直接展示 repair preview

### 执行阶段 — 只两类入口

| 页面 | 问题 | 数据源 |
|------|------|--------|
| 活跃风险提醒 | 现在还能不能按计划走？ | `execution-alerts` |
| 待调整项 | 今天需要我决定什么？ | `adjustment-queue` + `intervention-tep-*` |

**禁止**再建一套与 TEP DecisionProblem / repair option 平行的页面逻辑。

BFF：[EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md](../frontend/EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md)

---

## 7. 冰岛运营能力（代码 → 运营）

建立 [TEP-ICELAND-OPERATIONS-LEDGER.md](./TEP-ICELAND-OPERATIONS-LEDGER.md)：

- 数据源台账（道路、天气、日照、POI、住宿 latest arrival）
- 规则质量台账（每条 SDR：触发、采纳、误报、漏报、修复成功率）
- 真实事件案例库（道路关闭、强风、晚出发、活动取消、酒店晚到、高负荷、F-road 冲突）

案例库同时是**产品资产**和**新目的地迁移基准**。

---

## 8. 新西兰迁移门槛

**现在不建议**完整做新西兰 Pack。冰岛满足以下条件后再启动**最小 Pack**：

- [ ] ≥20 个真实行程
- [ ] ≥30 个真实 DecisionProblem
- [ ] ≥10 次用户采纳修复
- [ ] REMOVE / REPLACE 均有真实成功案例
- [ ] 误报与重复卡片可控
- [ ] 数据接入与 Hook 生命周期稳定
- [x] 分布式写回门禁完成（WP-TEP-17 · 2026-07-13）

**第一批只迁移：** 道路状态、驾驶负荷、日照、住宿可达、天气敏感活动、REMOVE/REPLACE。  
**不**一开始加入渡轮、房车、Great Walk 全套。

目标：验证 **TEP Core 未被冰岛逻辑污染**，不是「扩市场」。

---

## 9. 对外表述（含边界）

### 产品

> TripNARA 在冰岛自驾场景中持续监测道路、天气、日照与用户执行偏差，判断变化对具体行程的影响，并在用户确认后完成局部修复和计划重验证。

### 技术

> 已实现从 Executability Assessment、DecisionHook、RecoveryGraph、DecisionProblem，到 PlanVersion Writeback 与 Re-validation 的持续决策闭环。

### 商业

> 不只是提醒天气变化，而是将变化转化为针对个人行程的可执行调整方案。

### 必须保留的边界

- Phase 0 规则子集；非全冰岛覆盖
- REPLACE 仅预计算 POI；非全自动重规划
- 正处于 **Limited Pilot / Production Hardening**

---

## 10. 推进顺序（冻结）

| # | 动作 | 状态 |
|---|------|------|
| 1 | WP-TEP-16 正式签字 | ⬜ [SIGNOFF-CHECKLIST](./TEP-PHASE0-SIGNOFF-CHECKLIST.md) |
| 2 | 分布式并发 + DB 唯一门禁 | ✅ 2026-07-13 |
| 3 | 发布 Limited Pilot | ⬜ 待签字 |
| 4 | 接入 5–10 个内部真实行程 | ⬜ [PILOT-TRIP-TEMPLATE](./TEP-ICELAND-PILOT-TRIP-TEMPLATE.md) |
| 5 | 修复数据、卡片、误报 | ⬜ |
| 6 | 邀请 20–30 个外部试点 | ⬜ |
| 7 | 记录采纳率与修复成功率 | ⬜ |
| 8 | 小额付费测试 | ⬜ |
| 9 | 再决定 SDR-102 / 103 | 暂缓 |
| 10 | 新西兰最小 Pack 迁移 | 门槛后 |

---

## 11. 变更记录

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-07-13 | 1.0.1 | SIGNOFF-CHECKLIST + PILOT-TRIP-TEMPLATE；WP-TEP-17 ✅ |
| 2026-07-12 | 1.0.0 | 工程→产品→试点战略转向 SSOT |
