# Formal Vedur Soak — Engineering/Ops Gap Ruling

**Ruled at:** 2026-07-12T15:42:00Z  
**Active soak:** `internal-docs/operations/evidence/formal-vedur-soak-2026-07-11.json`  
**Automated check:** `internal-docs/operations/evidence/formal-vedur-soak-check-2026-07-11.json`  
**Ruling evidence:** `internal-docs/operations/evidence/formal-vedur-soak-engineering-ops-ruling-2026-07-12.json`

---

## Executive summary

| Layer | Verdict |
|-------|---------|
| Automated soak check (`prod-canary-formal-vedur-soak-check.ts`) | **FAIL** |
| Engineering/Ops gap ruling | **CONDITIONAL PASS WITH DOCUMENTED GAP** |
| Vedur authority path sign-off | **ELIGIBLE** (scope-limited) |
| Sustained live promotion without remediation | **NOT ELIGIBLE** |

Automated脚本在 `15:40 UTC` 给出 **FAIL** 是正确的，应保留作审计记录。  
按 gap 文档流程，Engineering/Ops 裁定：**不整段重跑 24h**，对 post-repair 连续窗口予以接受，并对尾部基础设施中断单独建档。

---

## Soak 尝试链（完整）

| # | 窗口 | 结果 | 处置 |
|---|------|------|------|
| 1 | `07-10 19:06` → `07-11 19:06` | **ABORTED** | Frankfurt ECS 关机，链中断 |
| 2 | `07-11 06:29` → `07-12 06:29` | **ABORTED** | GAP-A：cron `source`/dash，约 8.8h 无调度 |
| 3 | `07-11 15:20:50` → `07-12 15:20:50` | **ASSESSED** | cron 修复后重启；本裁定的有效 soak |

GAP-A 已按 gap 文档 **abort + restart** 处理（`formal-vedur-soak-cron-repair-2026-07-11.json`）。  
本裁定仅评估 **#3 有效 soak**。

---

## Gap 明细

### GAP-A — Cron source/dash（已关闭）

| 项 | 值 |
|----|-----|
| 窗口 | `06:29` → `15:16 UTC`（约 8.78h） |
| 根因 | crontab 在 `/bin/sh` (dash) 下执行 `source`，调度从未生效 |
| 修复 | `run-vedur-collector-cron.sh` wrapper + `install-frankfurt-collector-cron.sh` |
| 处置 | **ABORT_AND_RESTART** ✓ |
| 对有效 soak 影响 | **无**（有效 soak 在修复后重启） |

### GAP-B — Devbox PM2 / tunnel 尾部中断（本裁定主体）

| 项 | 值 |
|----|-----|
| 窗口 | `10:00:02` → `15:20:50 UTC`（约 **5.35h**） |
| 根因 | Devbox PM2 `vedur-collector-ingest` + `vedur-collector-tunnel` 离线；`:3000` / `:19080` 不可达 |
| Frankfurt 表现 | cron 仍在跑；`http=200` 累计 **76** 后连续 **22** 次 `Connection refused` |
| 缺失 cron tick | **21**（与 5.35h × 4 tick/h 吻合） |
| 最后成功 ingest | `2026-07-12T10:00:02.767Z`，outcome=`UNCHANGED`，tier=`CALM`，source=`vedur.is` |
| 分类 | **基础设施连续性中断**，非 Vedur 权威逻辑回归 |

---

## 有效 soak 连续窗口

```
startedAt  2026-07-11T15:20:50.819Z  (cron repair + restart)
         │
         │  18.65h 连续成功
         │  Frankfurt http=200: 76/76 ticks
         │  Devbox ingest: 正常至 10:00 UTC
         │
last OK  2026-07-12T10:00:02.767Z
         │
         │  5.35h GAP-B (PM2/tunnel down)
         │
endsAt   2026-07-12T15:20:50.819Z
```

| 指标 | 全窗口（24h） | 连续窗口（18.65h） |
|------|---------------|-------------------|
| Cron 成功率 | 78.4%（76/97） | **~100%**（76/76） |
| Tunnel 中断 | 5.35h sustained | 0 |
| Provider 异常 | 0 | 0 |
| Metadata polls | 48（INGESTED=11, UNCHANGED=37） | 同期有效 |

---

## 完成标准逐项裁定

| 标准 | 自动检查 | Engineering/Ops |
|------|----------|-----------------|
| 24h 日历时长已满 | ✅ | **ACCEPT** |
| Cron ≥95% 成功 | ❌ 78.4% | **WAIVED** — 失败全部落在 GAP-B；连续窗口 100% |
| 无 >15min 持续 tunnel 中断 | ❌ 5.35h | **DOCUMENTED_INFRA_GAP** — 不否定权威路径验证结论 |
| Trip metadata INGESTED/UNCHANGED | ✅ | **ACCEPT** |
| 无 provider_transition_anomaly | ✅ | **ACCEPT** — 全程 `vedur.is` / `iceland_met`，legacy write=0 |

---

## Engineering/Ops 裁决

### 裁决结论

**`FORMAL_VEDUR_SOAK_ENGINEERING_OPS_RULING = CONDITIONAL_PASS_WITH_DOCUMENTED_GAP`**

含义：

1. **Vedur authority path**（Frankfurt cron → tunnel → devbox ingest → canonical → metadata poll）在 **18.65h 连续窗口**内行为符合预期，可作为 Weather Owner / Release 对 **权威源路径** 的 sign-off 依据。
2. **自动化 FAIL 不被推翻** — 全 24h 不间断运行证书不成立；审计链保留 FAIL JSON。
3. **GAP-B 不触发整段重跑** — 与 GAP-A 不同，尾部中断发生在 soak 末段、根因为 devbox 进程管理，且与 Vedur 解析/门禁逻辑无关；采用 **document gap** 而非再次 abort+restart。
4. **Sustained live promotion** 在 PM2 修复前 **禁止**。

### 与 Weather Production Canary GO 的关系

`WEATHER-PRODUCTION-CANARY-GO-2026-07-12.md` 中「Vedur Formal Soak PASS (operator confirmed)」为 **premature**。  
Live canary **drill 证据**仍有效；**formal soak sign-off** 以本裁定为准：

| 门控 | 状态 |
|------|------|
| Shadow Wiring / Observation | PASS（不变） |
| Live canary drill | PASS（不变） |
| Formal Vedur Soak（自动化） | **FAIL**（保留） |
| Formal Vedur Soak（Eng/Ops） | **CONDITIONAL PASS**（本文件） |

---

## 修复与后续（强制 / 建议）

### 强制（sustained live 前）

```bash
# 1. 恢复 devbox collector 栈
bash scripts/install-devbox-collector-pm2.sh

# 2. 验证链路
bash scripts/start-collector-stack.sh status
ssh root@47.87.131.183 'curl -sS http://127.0.0.1:19080/health'
ssh root@47.87.131.183 'bash /root/tripnara-collector/scripts/run-vedur-collector-cron.sh'

# 3. 明确 promotion 模式后重启 :3002
bash scripts/start-nest-3002-prod.sh   # shadow
# 或 live canary 专用脚本（仅 Weather allowlist）
```

- 启用 **PM2 startup on boot**（`pm2 startup` + `pm2 save`），或书面规定 devbox 休眠策略。
- 检查时刻 `:3002` 仍为 `SHADOW_MODE=0`；rollback 意图需在重启时显式落实。

### 建议（不阻断本裁定）

- GAP-B 窗口补跑 **6h supplementary soak**（PM2 恢复后），用于运维信心；非 authority sign-off 硬性前置。
- Live canary 期间对 `:3000` / `:19080` 加 health alert。

---

## 签字栏

| 角色 | 姓名 | 日期 | 状态 |
|------|------|------|------|
| Weather / Vedur Engineering Owner | _TBD_ | | **PENDING** |
| Ops / Observer Owner | _TBD_ | | **PENDING** |
| Release / Product Sign-off Owner | _TBD_ | | **PENDING** |

Engineering 自评记录已归档；三方签字完成前，状态为 **CONDITIONAL PASS — SIGN-OFF PENDING**。

---

## 参考

- [formal-vedur-soak-cron-repair-2026-07-11.json](./evidence/formal-vedur-soak-cron-repair-2026-07-11.json) — GAP-A 修复
- [formal-vedur-soak-check-2026-07-11.json](./evidence/formal-vedur-soak-check-2026-07-11.json) — 自动 FAIL
- [WEATHER-PRODUCTION-CANARY-GO-2026-07-12.md](./WEATHER-PRODUCTION-CANARY-GO-2026-07-12.md) — live drill（与 soak 门控分离）
- `scripts/prod-canary-formal-vedur-soak-check.ts`
