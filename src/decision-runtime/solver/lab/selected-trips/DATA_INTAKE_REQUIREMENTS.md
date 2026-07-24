# M4-RA-01 选样数据需求书（测试阶段 · 无生产流量）

> **对象：** 产品 / 行程运营 / 测试 / 决策引擎  
> **目标：** 在无生产真流量时，准备 **≥10 条可验收的冰岛行程包**，解锁 Dataset → 进入 RA-01B  
> **日期：** 2026-07-16  
> **关联：** [SELECTED_TRIP_SAMPLING_POLICY](./SELECTED_TRIP_SAMPLING_POLICY.md) · [DATASET_SCHEMA](./DATASET_SCHEMA.md) · [M4-RA-01A](../../M4_RA_01A_PILOT_PREFLIGHT.md) · [M4-RA-01B](../../M4_RA_01_SELECTED_TRIPS_PILOT.md)

---

## 1. 一句话结论

**不要等生产用户。** 测试阶段应在 **staging 造 10 条「像真的」冰岛自驾行程**，脱敏导出为 `source=staging_export` 的 pack。  
现有 gold/synthetic 包只密封机制，**不能**清掉 Dataset WAIT。

---

## 2. 为什么要这 10 条

首批 Authoritative Canary 只开白名单 `selected_trips`，需要最小覆盖：

| # | 类别 | 条数 | 要验证什么 |
|---|------|------|------------|
| 1–2 | SHIFT | 2 | 时间窗平移（延误 / 开门时间变化） |
| 3–4 | SWAP | 2 | 同日两点对调 |
| 5–6 | SHORTEN | 2 | 过满日程压缩停留 |
| 7–8 | REROUTE | 2 | 路段关闭 / 改道 |
| 9–10 | 拒绝 / 回落 | 2 | Gateway BLOCK、fallback Neptune、不可修 |

合计 **10**。白名单可扩到 10–20，但 **少于 10 或分布缺口 ≠ 可签核**。

---

## 3. 交付物定义（什么叫「准备好了」）

每条行程必须是 **独立 pack 目录**（导出副本，不引用线上可变路径）：

```
src/decision-runtime/solver/lab/selected-trips/packs/<tripId>/
  manifest.json
  trip-context.json
  effective-plan.json
  evidence-snapshot.json
  constraints.json
  travel-matrix.json
  trigger.json
  expected-outcome.json
```

### 3.1 硬性合格线

| 项 | 要求 |
|----|------|
| 目的地 | `destination = IS`（冰岛） |
| 来源 | `manifest.source` ∈ `staging_export` \| `production_export`（**禁止**再用 `synthetic` / `gold_replay` 充数） |
| 脱敏 | `deidentified: true`；无 email / phone / name / payment 等 PII |
| 校验 | `npm run lab:validate-selected-trip -- --tripId <id>` → `eligible: true` |
| 操作 | `intendedOperation` ∈ `SHIFT` \| `SWAP` \| `SHORTEN` \| `REROUTE` |
| 人工复核 | `expected-outcome.json` 填 `reviewedBy` + `reviewedAt` |
| Evidence | 有冻结快照 `evidenceVersionId` + `frozenAt` |
| 矩阵 | `travel-matrix` 可覆盖计划活动对（空矩阵不合格） |

### 3.2 整批合格线

```bash
npm run lab:assemble-selected-pilot
# 期望：realEligible >= 10，samplingGaps 全 0

npm run lab:pilot-preflight-status
# 期望：Dataset: READY
```

---

## 4. 测试阶段怎么造（推荐路径）

### 路径 A（推荐）：Staging 种子行程 → 导出

适用于「没有生产用户、但有 staging / 测试账号」：

1. **在 staging 创建 10 条冰岛自驾行程**（可用测试账号，勿用真实支付）  
   - 已有一键脚本（账号 `2293028143@qq.com`）：  
     `npx tsx scripts/m4-ra01-seed-trips-for-user.ts`  
     → 生成 `ra01_is_01`…`ra01_is_10`（`destination=IS`，OWNER 为该邮箱）  
2. **人为制造可修问题**（见 §5 场景卡）  
3. **导出脱敏包**（冻结副本）：

```bash
npm run lab:import-selected-trip -- --tripId <stagingTripId> --environment staging --deidentify
```

> 注意：当前 `lab:import/export --tripId` 仍可能只写 stub；若 validate 失败，需补齐 matrix / evidence 或实现 live DB 导出后再进 Dataset READY。

4. 人工填 `expected-outcome.json`（accept / reject / fallback）  
5. validate → assemble → 产品确认后写入白名单

### 路径 B（过渡）：Gold 场景「晋升」为 staging 验收包

适用于「连 staging 行程都还没有」：

1. 从已有 gold 导出（机制已有 11 条 synthetic）  
2. **不得直接改计数器**；必须：  
   - 在 staging 用同等结构 **重建或回放成真实 trip 记录**（有真实 `tripId` / `planVersionId`）  
   - 再按路径 A 导出，`source=staging_export`  
3. 仅当行程在 staging DB/API 可查询、可触发 Decision Runtime 时，才算「真实」

> **禁止：** 把 `manifest.source` 从 `synthetic` 手工改成 `staging_export` 来骗过看板。

### 路径 C（不接受）：继续堆 synthetic gold

只能密封机制，**不能**进入 RA-01B Release。

---

## 5. 十条场景卡（直接按表造）

| ID | 操作 | 场景（冰岛） | 触发建议 | expected-outcome |
|----|------|--------------|----------|------------------|
| T01 | SHIFT | 南岸某日导游/开门延误 | 活动时间窗后移 60–90min | accept |
| T02 | SHIFT | 停车场高峰避让 | 到达窗平移，不改顺序 | accept |
| T03 | SWAP | 同日瀑布 A/B 对调 | 两 POI 顺序互换 | accept |
| T04 | SWAP | 蓝湖接近路段拥堵 | 邻近两点 SWAP | accept |
| T05 | SHORTEN | 单日过满（>建议驾驶+游览上限） | 压缩最长停留 | accept |
| T06 | SHORTEN | 冰河日行程过密 | 去掉/缩短远腿停留 | accept |
| T07 | REROUTE | F208 / 高地相关路段关闭 | 边禁止 → 改道 | accept |
| T08 | REROUTE | F235 或南岸边 mid-edge 关闭 | 局部改道，保 booked | accept |
| T09 | 负面 | 双路禁止且无安全局部修 | Gateway BLOCK / fallback | **fallback** |
| T10 | 负面 | 不可修或越权操作倾向 | 拒绝提升 OR-Tools | **reject** |

### 5.1 场景硬边界（造数时禁止踩线）

- ❌ 仅靠 `MOVE_DAY` / `REPLACE` / `AUTO_ARRANGE` 才能解  
- ❌ 需要取消 booked、跨日搬 booked、支付/退款  
- ❌ 高风险道路选择甩给用户当安全决策  
- ❌ 依赖未接入的实时服务导致 Evidence 无法冻结  
- ❌ 含真实 PII 且无法脱敏  

### 5.2 每条最低内容清单（给造数同学）

- [ ] 行程 ≥ 2 天或单日 ≥ 3 个活动（足够触发修复）  
- [ ] 至少 1 个明确问题（路关闭 / 过满 / 延误 / 冲突）  
- [ ] 活动含 `poiId` + 坐标（或完整 travel-matrix）  
- [ ] 至少 1 个 `booked` 活动（用于验证「不得误改 booked」）  
- [ ] Evidence 快照与 planVersion 对齐  
- [ ] `trigger.operation` 与场景卡一致  

---

## 6. 角色与交付节奏

| 角色 | 负责 | 产出 |
|------|------|------|
| 测试 / 行程运营 | 按场景卡在 staging 造行程 + 制造触发 | 10 个 staging `tripId` |
| 工程 | 导出脱敏 pack、修校验错误、跑 assemble | `packs/<tripId>/`、assemble 报告 |
| 产品 / 决策负责人 | 审 `expected-outcome`、填 accountability | 签字清单、白名单确认 |
| Release Owner | 白名单写入 + token mint（RA-01B） | `selected-trips.whitelist.json` |

### 建议排期（测试阶段）

| 日 | 动作 |
|----|------|
| D0 | 冻结本需求书；分配 T01–T10 负责人 |
| D1–D2 | Staging 造齐 10 条 + 触发问题 |
| D3 | 导出 + validate；修 blocked |
| D4 | 人工填 expected-outcome；assemble gaps=0 |
| D5 | 产品抽检 10 条 → 确认白名单草案 |

---

## 7. 验收命令（唯一裁判）

```bash
# 单条
npm run lab:validate-selected-trip -- --tripId <tripId>

# 整批
npm run lab:assemble-selected-pilot
npm run lab:pilot-preflight-status
npm run lab:go-no-go
```

| 看板字段 | 通过标准 |
|----------|----------|
| Dataset | `READY`（≥10 **real** = staging_export / production_export） |
| samplingGaps | 全 0 |
| Go/No-Go `dataset` | GO |
| Go/No-Go `whitelist` | 产品确认后 ≥10 非 PLACEHOLDER id |

---

## 8. 你现在就可以立刻交的最小包

若暂时只有 `tripId` 列表，请按此表提交（Excel / Markdown 均可）：

| tripId | staging 环境 | 意图操作 | 场景简述 | 是否含 booked | 联系人 | 备注 |
|--------|--------------|----------|----------|---------------|--------|------|
| | staging | SHIFT/SWAP/SHORTEN/REROUTE/负面 | | Y/N | | |

工程收到后执行：导出 → validate → 列出缺口（缺矩阵 / 缺 Evidence / 未脱敏等）→ 打回补齐。

**只有 tripId、staging 查不到行程 = 无法开工。**

---

## 9. 非目标（本需求不做）

- 不扩 Solver 算法、不加新 gold 家族充数  
- 不批准生产 `authority.json`（等本 10 条 READY 后再签）  
- 不开 `5%+` 流量；本批只服务 `selected_trips`  
- 不把 synthetic 包改 source 伪装成真实数据  

---

## 10. 签收

| 项 | 姓名 | 日期 |
|----|------|------|
| 需求确认（产品） | | |
| 造数就绪（测试） | | |
| 包校验通过（工程） | | |
| 白名单确认（产品） | | |
