# 冰岛 TEP Limited Pilot — 内部行程模板（5–10 条）

**状态：** 可用 · `npm run tep:pilot-seed -- --template=all --reset`  
**关联：** [TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md](./TEP-PHASE0-LIMITED-PILOT-PLAYBOOK.md) · [TEP-ICELAND-OPERATIONS-LEDGER.md](./TEP-ICELAND-OPERATIONS-LEDGER.md)

---

## 1. 通用前置条件（每条行程必做）

| 项 | 要求 |
|----|------|
| 目的地 | `IS` · 自驾 `self_drive_only` |
| 车辆 | 2WD 默认；F-road 场景单独标注 4WD |
| Plan Studio P1 | 写入 `maxDailyDriveMinutes` **或** 依赖读路径归一化（hours 亦可） |
| 原则 | 若「不夜驾」→ exploration principles 含 `NO_NIGHT_DRIVING` |
| 监控 | 行程绑定真实 `tripId`；WorldState 道路/天气 collector 正常 |
| 反馈 | 每条行程指定 **Owner** + **观察员**；结束后 24h 内填台账 §3–§5 |

**创建后验证命令（Engineering 可选）：**

```bash
npm run tep:pilot-seed -- --template=all --reset
npm test -- src/trips/tep/certification/is-cert.harness.spec.ts
npm run tep:pilot-smoke-all
npm run tep:pilot-runtime-smoke
npm run tep:pilot-planning-smoke      # PILOT-IS-05/07/08/09/10 规划期
npm run tep:pilot-planning-smoke -- --template=planning-all
npm run tep:pilot-concurrent-smoke    # PILOT-IS-06 IS-CERT-401-CONCURRENT
npm run tep:pilot-ci                 # seed + 全部 smoke + PG + HTTP（CI nightly 同款）
# GET /api/trips/pilot_is_01/executability?refresh=true
```

---

## 2. 内部试点行程卡（建议顺序）

### PILOT-IS-01 — 南岸 5 日 · 高负荷日（SDR-101）

| 字段 | 值 |
|------|-----|
| **路线** | Reykjavík → Seljalandsfoss → Skógafoss → Vík → Jökulsárlón 区域 |
| **天数 / 人数** | 5 天 · 2 人 |
| **季节** | 6–8 月（日照充足） |
| **车辆** | 2WD |
| **预期 Hook** | `SDR-101` 高负荷日 → `REPAIR-SDR101-*` REMOVE |
| **认证对照** | IS-CERT-302 / IS-CERT-401 |
| **成功标准** | adjustment-queue 出现负荷卡 → accept REMOVE → executability 改善 |
| **Owner** | Engineering |
| **tripId** | `pilot_is_01`（`npm run tep:pilot-seed -- --reset`） |

### PILOT-IS-02 — 环岛精简 7 日 · 道路关闭（SDR-002）

| 字段 | 值 |
|------|-----|
| **路线** | 黄金圈 + 南岸回环；含 1 段易受影响道路 ref |
| **天数 / 人数** | 7 天 · 2–4 人 |
| **季节** | 5–9 月 |
| **车辆** | 2WD |
| **预期 Hook** | `ROAD_STATUS_CHANGE` → SDR-002 → intervention-tep |
| **认证对照** | IS-CERT-301 |
| **成功标准** | 道路事件 → 单张主卡（无 Canonical 重复，404 语义） |
| **Owner** | Engineering |
| **tripId** | `pilot_is_02`（`npm run tep:pilot-seed -- --template=02 --reset`） |
| **runtime 验证** | `npm run tep:pilot-runtime-smoke -- --template=02`（含 IS-CERT-404 adjustment-queue 去重） |

### PILOT-IS-03 — 海岸步行 · 天气 REPLACE（SDR-302）

| 字段 | 值 |
|------|-----|
| **路线** | 南岸 + 1 个**天气敏感**户外活动（沿海 walk / 户外 soak） |
| **天数 / 人数** | 5 天 · 2 人 |
| **季节** | 有风/降水窗口 |
| **车辆** | 2WD |
| **预期 Hook** | `WEATHER_THRESHOLD` → SDR-302 → REPLACE（预计算 indoor POI） |
| **认证对照** | IS-CERT-303 |
| **成功标准** | REPLACE accept → 新 activity 物化 → 原 coastal 活动移除 |
| **Owner** | Engineering |
| **tripId** | `pilot_is_03`（`npm run tep:pilot-seed -- --template=03 --reset`） |
| **runtime 验证** | `npm run tep:pilot-runtime-smoke -- --template=03`（wind ≥ 95 → `WEATHER_ACTIVITY_PROHIBITED`） |

### PILOT-IS-04 — 冬季南岸 · 晚出发 slip→日照（SDR-202）

| 字段 | 值 |
|------|-----|
| **路线** | Reykjavík → Vík；末段驾驶近民用暮光 |
| **天数 / 人数** | 4 天 · 2 人 |
| **季节** | **11 月–2 月**（短日照） |
| **车辆** | 2WD · `NO_NIGHT_DRIVING` |
| **预期 Hook** | Execution slip ≥60min → `HOOK-DAYLIGHT-*` → SDR-202 |
| **认证对照** | IS-CERT-405 |
| **成功标准** | 「我晚了」或等效 slip → 日照风险卡 → REMOVE 可选停靠 → 暮光违规下降 |
| **Owner** | Engineering |
| **tripId** | `pilot_is_04`（`npm run tep:pilot-seed -- --template=04 --reset`） |

### PILOT-IS-05 — 弹性日 · 住宿可达（SDR-203）

| 字段 | 值 |
|------|-----|
| **路线** | 含 remote 住宿 + 长驾驶日 |
| **天数 / 人数** | 6 天 · 2 人 |
| **季节** | 全年 |
| **车辆** | 2WD |
| **预期 Hook** | SDR-203 住宿/latest arrival 风险 |
| **认证对照** | IS-CERT-201 系列 |
| **成功标准** | 规划期 NEED_CONFIRM 或执行期 Hook；用户理解「晚到风险」 |
| **Owner** | Engineering |
| **tripId** | `pilot_is_05`（`npm run tep:pilot-seed -- --template=05 --reset`） |
| **runtime 验证** | `npm run tep:pilot-planning-smoke`（IS-CERT-102 → SDR-201 NEED_CONFIRM） |

### PILOT-IS-06 — 并发 accept 压测（工程向）

| 字段 | 值 |
|------|-----|
| **路线** | 任意含 SDR-101 REMOVE 选项的行程 |
| **目的** | 验证双 tab / 双设备同时 accept 仅一次物化 |
| **认证对照** | IS-CERT-401-CONCURRENT |
| **成功标准** | 第二次请求 replay 或 coalesce；无重复子 PlanVersion |
| **Owner** | Engineering |
| **tripId** | `pilot_is_06`（`npm run tep:pilot-seed -- --template=06 --reset`） |
| **runtime 验证** | `npm run tep:pilot-concurrent-smoke` |

### PILOT-IS-07 — 高地 F-road · 2WD 不可行（SDR-001）

| 字段 | 值 |
|------|-----|
| **路线** | Vik → Landmannalaugar；含 **F208** 高地段 |
| **天数 / 人数** | 5 天 · 2 人 |
| **季节** | 6–8 月（高地开放窗口） |
| **车辆** | **2WD**（故意与 F-road 冲突） |
| **预期 Hook** | 规划期 SDR-001 → `NOT_EXECUTABLE` / REJECT |
| **认证对照** | IS-CERT-001 |
| **成功标准** | executability 明确「车辆/路段不可行」；用户改 4WD 或改线 |
| **Owner** | Engineering |
| **tripId** | `pilot_is_07`（`npm run tep:pilot-seed -- --template=07 --reset`） |
| **runtime 验证** | `npm run tep:pilot-planning-smoke -- --template=07` |

### PILOT-IS-08 — 租车合同禁 F-road（SDR-003）

| 字段 | 值 |
|------|-----|
| **路线** | Vik → Landmannalaugar；**4WD** 但标准合同 **NO_F_ROAD** |
| **天数 / 人数** | 5 天 · 2 人 |
| **季节** | 6–8 月 |
| **车辆** | 4WD · 冰岛 pack 默认 rentalRestrictions |
| **预期 Hook** | SDR-003 → `NOT_EXECUTABLE` |
| **认证对照** | IS-CERT-004 |
| **成功标准** | 卡片说明合同/保险约束；不可 silent 放行 F-road |
| **Owner** | Engineering |
| **tripId** | `pilot_is_08`（`npm run tep:pilot-seed -- --template=08 --reset`） |
| **runtime 验证** | `npm run tep:pilot-planning-smoke -- --template=08` |

### PILOT-IS-09 — 预约活动赶不上（SDR-203）

| 字段 | 值 |
|------|-----|
| **路线** | Reykjavík → Blue Lagoon **16:00 预约**；路上 17:00 才能到 |
| **天数 / 人数** | 5 天 · 2 人 |
| **季节** | 全年 |
| **车辆** | 2WD |
| **预期 Hook** | SDR-203 固定可达性 → `NOT_EXECUTABLE` |
| **认证对照** | IS-CERT-003 |
| **成功标准** | 规划期即拒绝或强提示改时段/改路线（非执行期才爆雷） |
| **Owner** | Engineering |
| **tripId** | `pilot_is_09`（`npm run tep:pilot-seed -- --template=09 --reset`） |
| **runtime 验证** | `npm run tep:pilot-planning-smoke -- --template=09` |

### PILOT-IS-10 — 道路证据过期（UNKNOWN）

| 字段 | 值 |
|------|-----|
| **路线** | 含 F208 ref；**道路证据 validUntil 已过期** |
| **天数 / 人数** | 5 天 · 2 人 |
| **季节** | 8 月 |
| **车辆** | 4WD |
| **预期 Hook** | 无 fresh 证据 → `UNKNOWN` / SDR-002 UNKNOWN outcome |
| **认证对照** | IS-CERT-103 |
| **成功标准** | 不假装确定 OPEN/CLOSED；UI 引导刷新/人工确认 |
| **Owner** | Engineering |
| **tripId** | `pilot_is_10`（`npm run tep:pilot-seed -- --template=10 --reset`） |
| **runtime 验证** | `npm run tep:pilot-planning-smoke -- --template=10` |

---

## 3. 单条行程反馈表（Owner 填写 → 台账 §5）

复制到案例库或飞书/Notion：

```
行程 ID: PILOT-IS-__
tripId: 
日期: 
类型: [ ] 道路 [ ] 天气 [ ] 晚出发 [ ] 高负荷 [ ] REPLACE [ ] 其他

1. 系统是否比您更早发现问题？  [ ] 是 [ ] 否 [ ] 部分
2. 卡片描述是否准确？          [ ] 是 [ ] 否 — 说明: ___
3. 是否出现重复/无关卡片？      [ ] 无 [ ] 有 — 说明: ___
4. 是否采纳推荐修复？            [ ] REMOVE [ ] REPLACE [ ] 忽略 [ ] 手动改
5. 若未采纳，原因: ___
6. 写回后行程是否更可执行？      [ ] 是 [ ] 否
7. 是否愿意为此类保障付费？      [ ] 是 [ ] 否 — 区间: ___
8. 截图 / adjustment-queue JSON 链接: ___
```

---

## 4. W1 启动建议（签字后第 1 周）

| 天 | 动作 |
|----|------|
| D0 | 签字完成 → 登记 PILOT-IS-01～10 tripId |
| D1–D3 | 内部 2 条行程（01 高负荷 + 02 道路）走完整 accept 链 |
| D4 | 07/08/09 规划期 REJECT/UNKNOWN 卡片目检 |
| D5 | 04 冬季 slip + 10 证据过期场景 |
| D6 | 06 并发压测 + 台账 W1 汇总 |
| D7 | 三方 30min 评审：误报 / 漏报 / UI 摩擦 |

---

## 5. 变更记录

| 日期 | 说明 |
|------|------|
| 2026-07-13 | PILOT-IS-07～10 场景定义 + seed + planning smoke |
| 2026-07-13 | PILOT-IS-05/06 seed+smoke；404 queue E2E；403 PG；HTTP Nest E2E；tep:pilot-ci 扩展 |
| 2026-07-13 | 初版：7 槽内部模板 + 反馈表 + W1 节奏 |
