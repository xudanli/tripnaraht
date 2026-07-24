# WP-TEP-16 — 三方签字 Checklist（执行版）

**用途：** 签字会议 / 异步评审的一页清单；勾选完成后在 [TEP-PHASE0-CONTRACT-FREEZE.md](./TEP-PHASE0-CONTRACT-FREEZE.md) §8 填姓名与日期。  
**签后状态：** `Production Candidate — Limited Pilot`（**不是** Production Ready）  
**前置：** WP-TEP-17 ✅（2026-07-13）· 技术门槛已满足

---

## 0. 签字前自动化回归（Engineering 执行，三方可复验）

**§0 状态列** 可由 `npm run tep:signoff-autocheck` 在回归全绿后自动写入（证据 JSON 见 `artifacts/tep-signoff/`）。`tep:pilot-ci` 末尾会带 `--from-ci` 自动勾选 mock/PG/表检查项；`TEP 全量` 需单独全量跑或 `--from-ci` 外手动执行。

```bash
# 全量 TEP
npm test -- src/trips/tep

# mock 写回 + 并发 + STALE + REPLACE + slip→日照 + 404 去重
npm test -- src/trips/tep/certification/is-cert-writeback.integration.spec.ts
npm test -- src/trips/tep/certification/is-cert-404.integration.spec.ts

# Pilot CI 同款（seed 01–10 → HTTP → smoke → PG → §0 autocheck）
DATABASE_URL=postgresql://... npm run tep:pilot-ci

# 仅更新 §0 勾选（CI 刚跑完时用 --from-ci）
DATABASE_URL=postgresql://... npm run tep:signoff-autocheck -- --from-ci

# staging PG 写回（401/402/403/401-CONCURRENT）
DATABASE_URL="$(grep '^DATABASE_URL=' .env.staging | sed 's/^DATABASE_URL=//' | tr -d '"')" npm run test:tep-writeback-pg
```

| 检查项 | 期望 | 状态 |
|--------|------|------|
| TEP 全量 | 31 suites / ~126 tests PASS | ⬜ skipped · skipped in --from-ci (run npm run tep:signoff-autocheck without --from-ci) |
| `npm run tep:pilot-ci` | seed 01–10 + HTTP + smoke + PG 全绿 | ✅ 2026-07-12 · tep:pilot-ci completed in this session |
| IS-CERT-401-CONCURRENT mock | 双并行 → 单 PlanVersion | ✅ 2026-07-12 · covered by tep:pilot-ci unit slice (is-cert-writeback.integration.spec.ts) |
| IS-CERT-404 mock | 道路事件 → 单张主卡 | ✅ 2026-07-12 · covered by tep:pilot-ci unit slice (is-cert-404.integration.spec.ts) |
| IS-CERT-401/402/403/401-CONCURRENT staging PG | 4 tests PASS | ✅ 2026-07-12 · covered by tep:pilot-ci PG slice (test:tep-writeback-pg) |
| `tep_repair_executions` 表 | staging 已存在 | ✅ 2026-07-12 · public.tep_repair_executions present |

---

## 1. 产品负责人 Checklist

**确认的是范围与边界，不是「零 Bug」。**

| # | 确认项 | 参考 | ☐ |
|---|--------|------|---|
| P1 | Phase 0 **仅冰岛自驾**；不对外宣称全冰岛道路/活动覆盖 | [STATUS §10](./TEP-PHASE0-STATUS.md) | |
| P2 | 写回动作 **REMOVE + 预计算 REPLACE**；无运行时 LLM 搜 POI | [CONTRACT-FREEZE §3.2](./TEP-PHASE0-CONTRACT-FREEZE.md) | |
| P3 | 约束 UI **不得**按 `type===HARD` 推断全 enforce；见 Registry 白名单 | [CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md](./CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md) | |
| P4 | 团队成员/决策权限 UI **Phase 0 隐藏**；accept 不依赖团队治理 | [HANDOFF §2.11](../frontend/TEP-SELF-DRIVE-FRONTEND-HANDOFF.md) | |
| P5 | 试点 SKU：**A 规划费 + B 运行保障**；智能助手含在 B 内 | [PLAYBOOK §3 用法 C](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md) | |
| P6 | 试点指标与台账模板已就绪 | [OPERATIONS-LEDGER](./TEP-ICELAND-OPERATIONS-LEDGER.md) · [PILOT-TRIP-TEMPLATE](./TEP-ICELAND-PILOT-TRIP-TEMPLATE.md) | |
| P7 | 对外表述含 **Limited Pilot** 边界（非 Production Ready） | [PLAYBOOK §9](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md) | |
| P8 | SDR-102/103 **暂缓**；触发条件已读并同意 | [PLAYBOOK §5](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md) | |

**产品签字：** _________________ · 日期 _______

---

## 2. 后端 / 架构负责人 Checklist

| # | 确认项 | 参考 | ☐ |
|---|--------|------|---|
| E1 | 四对象链 + `ExecutabilityStatus` / `RuleOutcome` 冻结语义 | [CONTRACT-FREEZE §2–§3](./TEP-PHASE0-CONTRACT-FREEZE.md) | |
| E2 | 幂等键 `trip:{tripId}:tep-repair:{optionId}` + STALE 409 | [CONTRACT-FREEZE §5](./TEP-PHASE0-CONTRACT-FREEZE.md) | |
| E3 | WP-TEP-17 三层门禁已上线：L0 inflight + L1 advisory lock + L2 表 | [WRITE-CONCURRENCY-GATE](./TEP-WRITE-CONCURRENCY-GATE.md) | |
| E4 | TEP / Canonical 去重键与 IS-CERT-404 | [CONTRACT-FREEZE §6](./TEP-PHASE0-CONTRACT-FREEZE.md) | |
| E5 | MAX_DAILY_DRIVE 读路径已归一化；写入双写仍待 Compiler | [REGISTRY §3](./CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md) | |
| E6 | 物化失败不提升 effective；IS-CERT-403 行为接受 | [CONTRACT-FREEZE §5.6](./TEP-PHASE0-CONTRACT-FREEZE.md) | |
| E7 | 已知缺口 §7.4 已读；多实例竞态 **已关闭** | [CONTRACT-FREEZE §7.4](./TEP-PHASE0-CONTRACT-FREEZE.md) | |
| E8 | staging PG 写回 E2E 可重复跑通 | 本文 §0 命令 | |

**后端/架构签字：** _________________ · 日期 _______

---

## 3. Mobile / Web 消费方 Checklist

| # | 确认项 | 参考 | ☐ |
|---|--------|------|---|
| F1 | Executability 仅用四种状态 + 三种 RuleOutcome；无平行枚举 | [CONTRACT-FREEZE §2](./TEP-PHASE0-CONTRACT-FREEZE.md) | |
| F2 | 执行页仅 **`execution-alerts` + `adjustment-queue`** 两类入口 | [PLAYBOOK §6](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md) | |
| F3 | accept 路径：`intervention-tep-*` → `tep-repairs/accept`；带 `basePlanVersionId` | [BFF §2.3a](../frontend/EXECUTION-ALERTS-AND-ADJUSTMENT-QUEUE-BFF.md) | |
| F4 | STALE → 刷新 queue + 重拉 preview；不静默重试写回 | [WEB-P2](../frontend/TEP-SELF-DRIVE-WEB-P2-INTEGRATION.md) | |
| F5 | P0–P3 集成文档与 HANDOFF 已对齐 Phase 0 范围 | [HANDOFF](../frontend/TEP-SELF-DRIVE-FRONTEND-HANDOFF.md) | |
| F6 | Travel objectives：9-principle 排序 + HARD 卡片分离；不以 `type===HARD` 当 enforce | [REGISTRY §6](../product/CONSTRAINT-CAPABILITY-REGISTRY-PHASE0.md) | |
| F7 | `REPAIR_IN_PROGRESS` (409) 客户端退避重试策略已定义 | [WRITE-CONCURRENCY-GATE §4](./TEP-WRITE-CONCURRENCY-GATE.md) | |

**Mobile/Web 签字：** _________________ · 日期 _______

---

## 4. 签后动作（Engineering + Product）

| # | 动作 | 负责人 | ☐ |
|---|------|--------|---|
| A1 | 更新 [TEP-PHASE0-STATUS.md](./TEP-PHASE0-STATUS.md) §1.3 → `Production Candidate — Limited Pilot` | Eng | |
| A2 | 更新 [CONTRACT-FREEZE](./TEP-PHASE0-CONTRACT-FREEZE.md) §8 签字表 | Product | |
| A3 | 在 [OPERATIONS-LEDGER](./TEP-ICELAND-OPERATIONS-LEDGER.md) §3 登记首批内部行程 | Ops/Product | |
| A4 | 启动内部试点 W1 指标采集 | Ops | |
| A5 | 通知相关方：可接 **真实用户写回**（staging/prod 按发布流程） | Release | |

---

## 5. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-13 | §0 `tep:signoff-autocheck` 自动勾选；PILOT-IS-07～10 场景+seed |
| 2026-07-13 | §0 增补 `tep:pilot-ci`、IS-CERT-404/403 PG |
| 2026-07-13 | 初版：WP-TEP-17 完成后发布；含自动化回归 + 三方分项 checklist |
