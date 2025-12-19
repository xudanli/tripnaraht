# RailPass UI 原型支持

本文档说明已实现的 UI 原型支持功能。

## B1. PassProfile 向导（最短 3 问）

**接口**: `POST /railpass/wizard/complete-profile`

**功能**: 通过最短 3 个必问问题完成 PassProfile 配置

**请求示例**:
```json
{
  "tripId": "trip-123",
  "residencyCountry": "CN",  // Q1: 居住国
  "passType": "GLOBAL",       // Q2: Global 还是 One Country
  "validityType": "FLEXI",    // Q3: Flexi 还是 Continuous
  "travelDaysTotal": 7,       // 如果是 Flexi，Travel Days 总数
  "mobileOrPaper": "MOBILE"   // Q4（可选）
}
```

**响应**: 
- `passProfile`: 构建的 RailPassProfile
- `eligibility`: 合规检查结果
- `missingInfo`: 缺失的信息列表（如果有）

**处理逻辑**:
- 如果用户不提供可选字段（如 mobileOrPaper），系统会标记为未知，但允许继续
- 自动根据居住国判断 Eurail/Interrail

---

## B2. 输出总览卡

**接口**: `POST /railpass/executability/check`

**功能**: 生成可执行性检查总览，用于行程结果顶部的总览卡片

**请求示例**:
```json
{
  "passProfile": { /* RailPassProfile */ },
  "segments": [ /* RailSegment[] */ ],
  "reservationTasks": [ /* ReservationTask[] */ ],
  "placeNames": {
    "123": { "name": "Munich", "countryCode": "DE" }
  }
}
```

**响应结构**:
```typescript
{
  executableCount: 5,        // ✅ 可执行段：X
  needConfirmationCount: 2,  // ⚠️ 需确认段：Y
  highRiskCount: 1,          // ❗高风险段：Z
  estimatedTravelDaysUsed: { // （Flexi 才展示）
    total: 7,
    remaining: 3,
    explanation: "预计消耗 7 天，剩余 3 天"
  },
  segments: [ /* SegmentCardInfo[] */ ],
  summarySuggestions: [
    "建议补全通票信息以获得更准确的检查结果"
  ],
  hasIncompleteProfile: false,
  missingInfo: []
}
```

**UI 建议操作按钮**:
- 「补全通票信息」- 调用 B1 接口
- 「只看高风险段」- 前端过滤 `segments` 中 `riskLevel === 'HIGH'`
- 「给我更省 Travel Day 的方案」- 调用 B6 接口，`strategy: 'MORE_ECONOMICAL'`

---

## B3. 段级卡片

**数据来源**: `POST /railpass/executability/check` 返回的 `segments` 数组

**数据结构** (`SegmentCardInfo`):
```typescript
{
  segmentId: "seg-123",
  departureTime: "2026-07-01T08:12:00Z",
  fromPlace: { name: "Munich", countryCode: "DE" },
  toPlace: { name: "Vienna", countryCode: "AT" },
  
  // 第一层（必看）
  coverage: "COVERED",  // ✅/❌/⚠️
  travelDayInfo: {
    consumed: true,
    daysConsumed: 1,
    explanation: "Flexi 消耗 1 天（当天乘车）"
  },
  reservationInfo: {
    status: "UNKNOWN",  // REQUIRED/OPTIONAL/UNKNOWN/NOT_REQUIRED
    mandatoryReason: "HIGH_SPEED",
    feeEstimate: { min: 3, max: 30, currency: "EUR" },
    riskLevel: "MEDIUM",
    suggestions: ["建议提前确认是否强制订座"]
  },
  riskLevel: "MEDIUM",  // LOW/MEDIUM/HIGH
  
  // 第二层（常看）
  keySuggestions: [
    "上车前把该段 Journey 加入通票",
    "建议提前确认是否强制订座；订不到可换慢车/换时段"
  ],
  
  // 第三层（折叠）
  details: {
    mobilePassReminders: [
      "需定期联网验证，离线过久可能导致 inactive"
    ],
    peakSeasonWarnings: [
      "如为周末/节假日热门时段：可能售罄（建议提前订）"
    ],
    ruleExplanation: [
      "夜车跨午夜换乘会消耗 2 个 Travel Day"
    ]
  }
}
```

**UI 展示建议**:
- 主卡片显示：覆盖状态、Travel Day、订座状态、风险等级、关键建议
- 折叠区（▼ 风险详情）：显示 `details` 中的所有信息

---

## B4. 高风险提示模板

**接口**: `POST /railpass/executability/high-risk-alerts`

**功能**: 生成高风险提示及替代方案（用于 System2 解释）

**响应结构** (`HighRiskAlert[]`):
```typescript
[
  {
    type: "HOME_COUNTRY_LIMIT",
    affectedSegmentIds: ["seg-123"],
    explanation: "这段涉及居住国（DE）境内使用。Interrail Global 通常只允许居住国 outbound/inbound 两次。",
    alternatives: [
      {
        id: "buy_separate_ticket",
        title: "这段改为单独买票",
        description: "不占用通票规则风险",
        impact: { costDelta: 50 }
      },
      {
        id: "adjust_route",
        title: "调整路线",
        description: "把居住国境内行程集中在同一天作为 outbound/inbound 使用"
      }
    ],
    severity: "error"
  }
]
```

**支持的高风险类型**:
- `HOME_COUNTRY_LIMIT` - Interrail 本国段限制
- `TRAVEL_DAY_OVERUSE` - Flexi Travel Day 超限
- `NIGHT_TRAIN_2_DAYS` - 夜车可能扣 2 天
- `RESERVATION_MANDATORY` - 必须订座但未订
- `RESERVATION_QUOTA_HIGH` - 订座配额紧张
- `PASS_VALIDITY_EXCEEDED` - Pass 有效期超限
- `MOBILE_PASS_OFFLINE_RISK` - Mobile Pass 离线风险

**UI 展示建议**:
- 以警告/错误卡片形式展示
- 显示解释原因
- 列出所有替代方案（带 impact 信息）

---

## B5. 信息层级

**第一层（必看）**:
- `coverage` - 覆盖状态 ✅/❌/⚠️
- `travelDayInfo` - Travel Day 消耗（如果有）
- `reservationInfo.status` - 订座状态

**第二层（常看）**:
- `riskLevel` - 风险等级
- `keySuggestions` - 1~2 条关键建议

**第三层（折叠）**:
- `details` - 规则解释细节、风险详情、Mobile Pass 提醒、旺季警告

**实现方式**: 数据结构已支持分层，前端根据层级决定默认展示/折叠。

---

## B6. "改方案按钮"文案

**接口**: `POST /railpass/plan/regenerate`

**功能**: 根据策略重新生成方案

**请求示例**:
```json
{
  "tripId": "trip-123",
  "strategy": "MORE_STABLE",  // MORE_STABLE | MORE_ECONOMICAL | MORE_AFFORDABLE
  "customParams": {
    "avoidMandatoryReservations": true,
    "minimizeTravelDays": false,
    "maxReservationFee": 100
  }
}
```

**策略说明**:
- `MORE_STABLE` - 更稳：避开必须订座的车
- `MORE_ECONOMICAL` - 更省：减少 Travel Day 消耗
- `MORE_AFFORDABLE` - 更便宜：对比直购票 vs 通票+订座（P2，待实现）

**状态**: 接口框架已创建，具体实现需要集成 Decision 层的 Neptune 策略。

**UI 按钮文案建议**:
- 「更稳：避开必须订座的车」→ `strategy: "MORE_STABLE"`
- 「更省：减少 Travel Day 消耗」→ `strategy: "MORE_ECONOMICAL"`
- 「更便宜：对比直购票 vs 通票+订座」→ `strategy: "MORE_AFFORDABLE"`

---

## 前端调用流程建议

### 1. 首次配置 PassProfile
```
用户进入行程页面
→ POST /railpass/wizard/complete-profile（3 问）
→ 保存 passProfile 到 Trip
→ 继续规划行程
```

### 2. 查看可执行性检查
```
行程规划完成
→ POST /railpass/executability/check
→ 显示总览卡片（B2）
→ 显示段级卡片列表（B3）
```

### 3. 处理高风险提示
```
如果 highRiskCount > 0
→ POST /railpass/executability/high-risk-alerts
→ 显示高风险提示卡片（B4）
→ 用户选择替代方案
→ 调用改方案接口（B6）
```

### 4. 改方案
```
用户点击改方案按钮
→ POST /railpass/plan/regenerate（选择策略）
→ 重新生成 segments
→ 重新调用可执行性检查
→ 更新 UI
```

---

## 注意事项

1. **Mobile Pass 24 小时联网要求**: 在段级卡片和详情中都有提醒
2. **Flexi 跨午夜规则**: 自动计算并显示在 travelDayInfo 中
3. **订座费用预估**: 提供 min/max 范围，实际费用需订座时确认
4. **缺失信息处理**: 系统允许部分信息缺失继续运行，但会标记 `hasIncompleteProfile`
5. **Place 名称映射**: 建议前端传入 `placeNames` 映射以获得更好的展示效果

---

## 待完善功能

- [ ] 改方案接口的具体实现（需要集成 Decision 层）
- [ ] 更便宜策略的直购票价格对比（P2）
- [ ] PassProfile 的数据库持久化
- [ ] Place 名称的自动获取（如果前端不提供）
