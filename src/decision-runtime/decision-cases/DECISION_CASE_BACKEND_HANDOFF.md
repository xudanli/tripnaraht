# DecisionCase Handoff = FE 验收清单

**日期：** 2026-07-15  
**原则：** 后端可联调；FE **不改架构**，只接字段与验收下列清单。  
**产品边界：** 决策空间 = 已 publish 的 `decision-problems`；机会 inbox = 未过门槛 / 未过 Eligibility。

**iOS 完整对接文档：** [`DECISION_SPACE_IOS_HANDOFF.md`](./DECISION_SPACE_IOS_HANDOFF.md)（API 总表、写路径、Codable 参考、DoD、smoke curl）

---

## 0. 核心链路（不变 · 联调验收主路径）

```
两壳 ensure（车型 + 保险 SHELL）
  → 路线就绪 ENRICHED
  → 用户选 option → resolve
  → CONSTRAINT_WRITEBACK apply
  → re-ensure（可冒出 F-road 等）
  → 队列 revalidate
```

并行不变：

| 层 | 规则 |
|----|------|
| 机会层 | 低 materiality / 未过 Eligibility → 只进 `decision-opportunities`，**默认不进队列** |
| 三闸 | Detection → Eligibility（体能/资格）→ Materiality≥6 才 `published` |
| 去重 | 队列已有 Canonical `EXCESSIVE_DAILY_LOAD` → **不展示** DecisionCase `RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE` |

天气/封路仍走 Canonical L2（WORLD_EVENT），不进体验机会漏斗。

---

## 1. FE 验收清单（文档即 DoD）

### A. 决策空间（只绑 problems）

- [ ] **只消费** `GET /api/trips/:tripId/decision-problems` 作为队列数据源
- [ ] 识别 `problemId` 以 `dc_` 开头的 DecisionCase；读 `item.decisionCase`
- [ ] 用 **`decisionCase.uiGroup` 枚举**分组（不要用技术 type / semanticKey 当分组）
  - `MUST_CONFIRM` → 必须确认
  - `IMPORTANT_CHOICE` → 重要选择
  - `WORTH_CONSIDERING` → 值得考虑  
  （可用 `uiGroupLabelZh` 展示，**勿把中文当枚举键**）
- [ ] `actionability.writeChain === 'CONSTRAINT_WRITEBACK'` 时走现有 resolve → apply 路径（list + detail 均应有该字段）
- [ ] BLOCKING 空态：两壳未确认时，队列应至少能看到车型 + 保险（`requiredness=BLOCKING` / `uiGroup=MUST_CONFIRM`）

### B. 两壳 → ENRICHED → Apply → re-ensure

- [ ] 首刷 list：**车型 + 保险** SHELL 出现（`enrichmentStage: SHELL`）
- [ ] 路线/上下文就绪后再次 list：壳变为 **`ENRICHED`**（文案/options 更具体）
- [ ] 打开详情 / options：可见 tradeoffs；保险全档 option 带 `constraintHints.fordingExcluded: true`
- [ ] 选车型 option → resolve → **apply**：`constraints.vehicle_type` 写回；case → RESOLVED；队列刷新
- [ ] Apply 后 **re-ensure**：若路线含 F-road 且车型不匹配，可出现 `dc_froad_*`（BLOCKING）
- [ ] 保险同理：apply → RESOLVED → 队列更新（涉水免责文案始终可见）

### C. 条件 P0 卡（接数据即可，勿当 INFEASIBILITY）

- [ ] 落地长驾 / 环岛 vs 南岸：**SELECT**，按 `uiGroup` 展示，不是硬封锁
- [ ] 冰川：**一卡多 option**（徒步/短线/冰洞/观景/暂不）；`executable=false` 的 option 灰显（Eligibility 过滤）
- [ ] 高影响体验（whale / silfra / …）：过闸才在 problems；未过在机会层

### D. 机会层（可选 UI · 不进默认队列）

- [ ] `GET …/decision-opportunities` 可读；`eligible=false` 展示 `ineligibilityReason` / `eligibility.checks`
- [ ] 「加入比较 / 升级」调 `POST …/decision-opportunities/:id/publish` 后刷新 problems
- [ ] **未过 Eligibility 或 materiality<6 的项不得混进决策空间默认队列**

### E. 去重

- [ ] 同日已有 Canonical **`EXCESSIVE_DAILY_LOAD`** 时，列表中**不应再出现** DecisionCase 日驾超限卡（`RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE` / `dc_drive_*`）
- [ ] 落地 / 环岛 / 车型 / 保险 / 冰川 **不受** 该去重影响

### F. 近期不必做

- [ ] ~~重做决策空间架构~~
- [ ] ~~把机会层默认并进队列~~
- [ ] ~~用 `INFEASIBILITY` 渲染环岛/落地~~

可做、非阻塞：队列分组文案微调、BLOCKING 引导空态、深链 `OPEN_DECISION_SPACE`。

---

## 2. API（联调表）

| Method | Path | 用途 |
|--------|------|------|
| `GET` | `/api/trips/:tripId/decision-problems` | **决策空间队列**（仅 published） |
| `GET` | `/api/trips/:tripId/decision-opportunities` | 机会 inbox |
| `POST` | `/api/trips/:tripId/decision-opportunities/:opportunityId/publish` | 机会 → Case |
| `GET` | `…/decision-problems/:problemId` | 详情（`decisionCase` + actions） |
| `GET` | `…/decision-problems/:problemId/options` | options + tradeoffs |
| `POST` | `…/decision-problems/:problemId/resolutions` | 选 option |
| `POST` | `…/decision-problems/:problemId/apply` | `CONSTRAINT_WRITEBACK` → re-ensure |

---

## 3. 字段契约（FE 绑定）

```typescript
decisionCase?: {
  sourceKind: 'REQUIRED_CHOICE' | 'RULE_TRIGGER' | 'OPPORTUNITY' | 'WORLD_EVENT';
  requiredness: 'BLOCKING' | 'IMPORTANT' | 'OPTIONAL';
  domain: string;
  scope: 'TRIP' | 'DAY' | 'SEGMENT' | 'ACTIVITY';
  actionKind: string;
  materialityScore: number;
  materialityBreakdown: {
    budget: number; time: number; safety: number; fitness: number;
    team: number; bookingUrgency: number; irreversibility: number;
  };
  enrichmentStage: 'SHELL' | 'ENRICHED';
  writebackTargets: Array<'VEHICLE' | 'INSURANCE' | 'ROUTE' | 'LODGING' | 'ITINERARY' | 'BOOKING_INTENT'>;
  uiGroup: 'MUST_CONFIRM' | 'IMPORTANT_CHOICE' | 'WORTH_CONSIDERING';
  uiGroupLabelZh: string;
  /** 三闸 Eligibility 快照（体验卡常见） */
  eligibility?: {
    eligible: boolean;
    reason?: string;
    softWarnings: string[];
    checks: Array<{ code: string; dimension: string; passed: boolean; detail: string }>;
    eligibleOptionIds?: string[];
  };
};

actionability.writeChain?: 'CONSTRAINT_WRITEBACK';

actions[].constraintHints?: {
  fordingExcluded?: boolean;  // 保险：全档 true
  writebackPayload?: Record<string, unknown>;
}
```

| requiredness / 分 | uiGroup | 文案 |
|-------------------|---------|------|
| BLOCKING | MUST_CONFIRM | 必须确认 |
| IMPORTANT 或 6–8 | IMPORTANT_CHOICE | 重要选择 |
| OPTIONAL 已 publish | WORTH_CONSIDERING | 值得考虑 |
| <6 或 ineligible | （不进 problems） | 仅机会层 |

---

## 4. 三闸（BE 行为 · FE 只需知边界）

1. **Detection** — 规则命中（路线/prefs/抵达…）  
2. **Eligibility** — 年龄 / 体能 / 资格 / 排除项；失败 → opportunity + `eligible:false`，**不 publish**  
3. **Materiality** — 总分 ≥6（或 force BLOCKING）才进 problems  

AI **无权**直接 publish。

### Eligibility 数据来源（metadata）

优先级：`partyProfile.members[]` → `travelers[]` → `fitnessCapability` → 缺省成人 fitness=5。  
另：`excludeActivities` / `qualifications` / `exclusions`。

| 活动 | 年龄 | 体能 | 资格 | 硬排除（节选） |
|------|------|------|------|----------------|
| glacier_hike | ≥12 | ≥6 | — | pregnancy, heart_condition, … |
| silfra | ≥12 | ≥5 | swimming | pregnancy, heart_condition, … |
| snowmobile | ≥16 | ≥4 | drivers_license | pregnancy, heart_condition |
| whale / 观景 | 低 | 低 | — | 多为 soft |

冰川合并卡：不合格 option `executable=false`；全部主动产品不可选 → 不 publish。

---

## 5. 冰岛 P0 Case 表

| semanticKey | problemId | requiredness | 触发要点 |
|-------------|-----------|--------------|----------|
| `REQUIRED_CHOICE.VEHICLE_ROAD_FIT` | `dc_vehicle_{tripId}` | BLOCKING | 两壳之一；SHELL→ENRICHED |
| `REQUIRED_CHOICE.RENTAL_INSURANCE` | `dc_insurance_{tripId}` | BLOCKING | 两壳之一；涉水免责 |
| `RULE_TRIGGER.FROAD_VEHICLE_MISMATCH` | `dc_froad_{tripId}_{road}` | BLOCKING | 车型 apply 后 + F-road |
| `RULE_TRIGGER.EXCESSIVE_DAILY_DRIVE` | `dc_drive_{tripId}_d{n}` | IMPORTANT | 与 Canonical 日载 **去重** |
| `RULE_TRIGGER.LANDING_LONG_DRIVE` | `dc_landing_{tripId}` | IMPORTANT | 国际抵达 + Day1 长驾 |
| `RULE_TRIGGER.RING_VS_SOUTH_SCOPE` | `dc_ring_south_{tripId}` | IMPORTANT | 环岛意图 + 天数/日均 |
| `OPPORTUNITY.GLACIER_EXPERIENCE` | `dc_glacier_{tripId}` | IMPORTANT+ | 近冰川 + Eligibility + Mat≥6；**一卡** |
| `OPPORTUNITY.HIGH_IMPACT_EXPERIENCE` | `dc_exp_{kind}_{tripId}` | IMPORTANT | prefs + Eligibility + Mat≥6 |

**保险硬文案：** 涉水过河损坏 ≠ 普通保险覆盖（全险仍 `fordingExcluded`）。

### 联调 metadata 开关

```json
{
  "partyProfile": {
    "members": [
      {
        "ageYears": 34,
        "fitnessLevel": 6,
        "qualifications": ["swimming", "drivers_license"],
        "exclusions": []
      }
    ]
  },
  "excludeActivities": [],
  "routeDecisionFlags": {
    "maxDailyDriveHours": 11,
    "peakDriveDayIndex": 2,
    "day1DriveHours": 5,
    "hasInternationalArrival": true,
    "nightArrival": true,
    "wantsRingRoad": true,
    "nearGlacier": true,
    "glacierNeedsBooking": true,
    "highImpactExperience": "whale",
    "suppressDriveLoadCase": false,
    "suppressLandingCase": false,
    "suppressRingScopeCase": false,
    "forceLandingCase": false
  }
}
```

---

## 6. Apply 写回（与验收 B 对齐）

1. 写 `trip.metadata.constraints.*`（如 `vehicle_type` / `insurance_coverage_tier`）  
2. Case → `RESOLVED`  
3. `ensureAndCollectRows` 再跑  
4. invalidate 队列 cache → FE revalidate list

---

## 7. Fixture 冒烟

`3e4a1058-9218-467f-988a-c18008a14385`

```bash
TRIP=3e4a1058-9218-467f-988a-c18008a14385
BASE=http://localhost:3000/api

# A+B：两壳 + uiGroup
curl -s "$BASE/trips/$TRIP/decision-problems" \
  | jq '.data.items[] | {problemId,title,writeChain:.actionability.writeChain,decisionCase}'

# D：机会层 + eligibility
curl -s "$BASE/trips/$TRIP/decision-opportunities" | jq '.data'

# B：车型 apply 后应 RESOLVED，并可出现 F-road（视约束）
# POST …/resolutions → POST …/apply → 再 GET decision-problems
```

首次 list 写入 `metadata.decisionCases`（车型+保险壳）。

---

## 8. 验收通过标准（一句话）

FE 能用现有决策空间：**按 `uiGroup` 展示两壳 BLOCKING → ENRICHED → `CONSTRAINT_WRITEBACK` apply → 队列 re-ensure**；机会与不合格 Eligibility 不进默认队列；与 Canonical `EXCESSIVE_DAILY_LOAD` 不双开日驾卡。
