# Formal Status SSOT — Iceland Canonical Closed Loop

**Effective:** 2026-07-10 (updated)  

---

## P0 阻塞项

**Production Canary GO 唯一关键路径：** Vedur authoritative ingestion (`VEDUR_LIVE`)

| 工作流 | 状态 |
|--------|------|
| Collector Feasibility Spike | **SPIKE_PASS** — `47.87.131.183` 法兰克福 |
| Evidence Ingest API 契约 | **READY**（实现 + 验签 + 原始持久化） |
| 最小 Collector 部署 | **BLOCKED** — 待 SPIKE_PASS |
| Observational soak | **STARTED**（非签字，`open_meteo_fallback`） |
| 正式 24h soak | **NOT STARTED** — 待 Vedur 权威配置冻结 |

---

## 命名禁令

| ❌ 禁止笼统写法 | ✅ 准确写法 |
|----------------|------------|
| Staging Ready 已正式完成 | **SR#5 Engineering Self-Acceptance GO** |
| Live ingestion 已通过 | **Live API ingestion GO** + **Vedur authoritative ingestion** 分开记账 |
| Open-Meteo 成功 = 冰岛权威天气链通过 | **Vedur authoritative ingestion NO-GO**（当前） |
| 真实风暴 Live 闭环已通过 | **LIVE INGESTION PASS** + **REAL-SHAPE HAZARD REPLAY PASS**（分开） |

---

## 当前正式状态表

| 层级 | 状态 | 准确含义 |
|------|------|----------|
| **Canonical 工程实现** | **GO** | 主链、写入权、Repair、Revalidation 已实现 |
| **Devbox 双实例集成验收** | **GO** | PM2 双实例、`tripnara_staging` |
| **SR#5 / SR#6 / North Star** | **GO** | 工程自验收 evidence 齐全 |
| **Production Canary A+B+C** | **READY** | `tripnara_prod` 分层 drill 全过 |
| **Live API ingestion** | **GO** | Open-Meteo fallback；持久化 + SILENT |
| **Vedur authoritative ingestion** | **NO-GO** → **Collector 路径已验证**；待最小 Collector + Ingest 集成 |
| **REAL-SHAPE HAZARD REPLAY** | **GO** | Canary A/C replay evidence |
| **天气源策略** | **FROZEN** | Vedur 权威；Open-Meteo 降级；见 authority doc |
| **正式 24h soak** | **NOT STARTED** | 须等 Vedur egress 定案 + 最终配置冻结 |
| **Production Canary GO** | **NO-GO** | soak + Vedur 权威 + sign-off 待定 |
| **Production Cutover** | **NO-GO** | Legacy 仍为默认 |

---

## 天气源权威（已冻结）

→ [ICELAND-WEATHER-SOURCE-AUTHORITY-2026-07-10.md](./ICELAND-WEATHER-SOURCE-AUTHORITY-2026-07-10.md)

```
VEDUR_LIVE           → 可创建 / 升级 / 恢复天气风险
OPEN_METEO_FALLBACK  → NO_ACTION + 辅助；不得单独解除有效 Vedur 高风险
REAL_SHAPE_REPLAY    → 仅 Canary / Drill；禁止进入普通生产 Trip
```

---

## Production Canary Evidence（2026-07-10）

| Evidence | Result |
|----------|--------|
| `prod-canary-observe-a-*.json` | READY 7/7 |
| `prod-canary-suggest-b-*.json` | READY 11/11 |
| `prod-canary-execute-c-*.json` | READY 11/11 |
| `prod-canary-live-ingestion-*.json` | LIVE_INGESTION_PASS；`vedurDirectPass=false` |
| `vedur-egress-investigation-*.json` | Vedur TCP NO-GO |
| `observational-soak-*.json` | STARTED；SIGNOFF_ELIGIBLE=false |

---

## Scheme A — Collector 路径

→ [VEDUR-COLLECTOR-FEASIBILITY-SPIKE.md](./VEDUR-COLLECTOR-FEASIBILITY-SPIKE.md)  
→ [VEDUR-COLLECTOR-INGEST-API.md](./VEDUR-COLLECTOR-INGEST-API.md)

---

## 下一步顺序（不可打乱）

1. **候选主机跑 Collector Feasibility Spike**（P0）
2. SPIKE_PASS → 最小 Collector + 启用 Ingest API
3. 验证 `VEDUR_LIVE → NO_ACTION`
4. **正式 24h soak**（Vedur 权威配置）
5. 回滚演练 C→B→A→allowlist 清空
6. 人类三方 Owner sign-off
7. Production Canary Sign-off

**禁止：** 在 Open-Meteo fallback 配置上跑正式 sign-off soak，之后切回 Vedur（soak 作废）。

---

## References

- [PRODUCTION-CANARY-GO-READINESS.md](./PRODUCTION-CANARY-GO-READINESS.md)
- [ICELAND-WEATHER-SOURCE-AUTHORITY-2026-07-10.md](./ICELAND-WEATHER-SOURCE-AUTHORITY-2026-07-10.md)
