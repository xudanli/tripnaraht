# Rail Pass 规则接口文档

本文档包含所有与 Rail Pass 规则相关的 API 接口。

---

## 一、RAG 知识库规则提取接口

### 1. 提取 Rail Pass 规则

**端点**: `POST /api/rag/compliance/rail-pass`

**描述**: 从 RAG 知识库中提取铁路通票相关的合规规则。该接口使用 LLM 从知识库文档中提取结构化的 Rail Pass 规则信息。

**请求体**:
```json
{
  "passType": "Eurail Global Pass",
  "countryCode": "CH"
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| passType | string | 是 | 通票类型，例如："Eurail Global Pass", "Interrail Global Pass" |
| countryCode | string | 是 | 国家代码（ISO 3166-1 alpha-2），例如："CH", "FR", "DE" |

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "passType": "EURAIL_GLOBAL",
      "countryCode": "CH",
      "requiresReservation": true,
      "reservationFee": "9 EUR",
      "validTrainTypes": ["IC", "EC", "ICE"],
      "restrictions": "Glacier Express 需要额外预订",
      "source": "eurail-official",
      "eligibleTraveler": {
        "regions": ["Non-European"],
        "citizenship": []
      },
      "validCountries": ["CH", "FR", "DE", "IT"],
      "notValidOn": [],
      "seasonalRestrictions": null
    }
  ]
}
```

**响应字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| passType | string | Pass 类型：EURAIL_GLOBAL, EURAIL_ONE_COUNTRY, INTERRAIL_GLOBAL, INTERRAIL_ONE_COUNTRY |
| countryCode | string | 国家代码 |
| requiresReservation | boolean | 是否需要订座 |
| reservationFee | string | 订座费用（如果有） |
| validTrainTypes | string[] | 有效的列车类型 |
| restrictions | string | 限制说明 |
| source | string | 数据来源 |
| eligibleTraveler | object | 符合条件的旅行者信息 |
| validCountries | string[] | Pass 有效的国家列表 |
| notValidOn | string[] | 不适用于的列车类型 |
| seasonalRestrictions | object | 季节性限制（如果有） |

**使用场景**:
- 查询特定 Pass 类型在特定国家的使用规则
- 获取订座要求和费用信息
- 了解 Pass 的有效性和限制条件

**注意事项**:
- 该接口会调用 LLM 进行规则提取，可能需要几秒钟时间
- 结果基于 RAG 知识库中的文档，确保知识库已更新最新规则
- 如果知识库中没有相关规则，可能返回空数组

---

### 2. 刷新合规规则缓存

**端点**: `POST /api/rag/compliance/refresh`

**描述**: 手动触发合规规则缓存刷新。当知识库中的合规规则文档更新后，需要调用此接口使缓存失效并重新加载最新规则。

**请求体**: 无需请求体

**响应示例**:
```json
{
  "success": true,
  "message": "Compliance rules refresh started"
}
```

**使用场景**:
- 更新了铁路通票规则文档后
- 更新了步道访问规则后
- 修复了合规规则中的错误后
- 定期刷新确保规则最新

**注意事项**:
- 刷新操作是异步的，返回成功只表示刷新任务已启动
- 频繁调用可能影响系统性能，建议在非高峰期执行
- 刷新完成后，新请求将使用最新的规则数据

---

## 二、RailPass 模块接口

### 1. 合规检查

**端点**: `POST /api/railpass/eligibility`

**描述**: 检查用户居住国、旅行国家集合是否符合 Eurail/Interrail 规则。

**请求体**:
```json
{
  "residencyCountry": "CN",
  "travelCountries": ["FR", "DE", "IT"],
  "isCrossResidencyCountry": false,
  "departureDate": "2026-07-01"
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| residencyCountry | string | 是 | 用户居住国代码（ISO 3166-1 alpha-2） |
| travelCountries | string[] | 是 | 旅行国家代码列表 |
| isCrossResidencyCountry | boolean | 是 | 是否穿越居住国 |
| departureDate | string | 是 | 出发日期（ISO 8601 格式） |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "eligible": true,
    "passFamily": "EURAIL",
    "reason": "非欧洲居住者应使用 Eurail",
    "constraints": []
  }
}
```

---

### 2. Pass 推荐

**端点**: `POST /api/railpass/recommendation`

**描述**: 根据行程特征推荐合适的 Pass 配置（Global/OneCountry, Flexi/Continuous, class, mobile/paper）。

**请求体**:
```json
{
  "residencyCountry": "CN",
  "travelCountries": ["FR", "DE", "IT"],
  "estimatedRailSegments": 8,
  "crossCountryCount": 3,
  "isDailyTravel": false,
  "stayMode": "city_hopping",
  "budgetSensitivity": "MEDIUM",
  "tripDurationDays": 14,
  "tripDateRange": {
    "start": "2026-07-01",
    "end": "2026-07-14"
  },
  "passFamily": "EURAIL",
  "preferences": {
    "preferFlexibility": true,
    "preferMobile": true
  }
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| residencyCountry | string | 是 | 居住国代码 |
| travelCountries | string[] | 是 | 旅行国家列表 |
| estimatedRailSegments | number | 是 | 预估铁路段数 |
| crossCountryCount | number | 是 | 跨国数量 |
| isDailyTravel | boolean | 是 | 是否每天坐火车 |
| stayMode | string | 是 | 停留模式：city_hopping, base_city, mixed |
| budgetSensitivity | string | 是 | 预算敏感度：LOW, MEDIUM, HIGH |
| tripDurationDays | number | 是 | 行程天数 |
| tripDateRange | object | 是 | 行程日期范围 |
| passFamily | string | 是 | Pass 家族：EURAIL, INTERRAIL |
| preferences | object | 否 | 用户偏好 |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "recommendedProfile": {
      "passFamily": "EURAIL",
      "passType": "GLOBAL",
      "passClass": "SECOND",
      "passFormat": "MOBILE",
      "passDuration": "FLEXI",
      "travelDays": 7,
      "validityDays": 30,
      "estimatedCost": 350
    },
    "alternatives": [],
    "reasoning": "基于您的行程特征，推荐 Eurail Global Pass Flexi 7天..."
  }
}
```

---

### 3. 检查订座需求

**端点**: `POST /api/railpass/reservation/check`

**描述**: 检查单个 rail segment 是否需要订座，评估费用、风险、订座渠道。

**请求体**:
```json
{
  "segment": {
    "from": "Paris",
    "to": "London",
    "departureTime": "2026-07-15T09:00:00Z",
    "arrivalTime": "2026-07-15T12:30:00Z",
    "trainType": "EUROSTAR",
    "countryCode": "FR"
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "required": true,
    "fee": 30,
    "currency": "EUR",
    "riskLevel": "HIGH",
    "bookingChannels": ["online", "station"],
    "recommendedAdvanceDays": 60,
    "alternatives": []
  }
}
```

---

### 4. 规划订座任务

**端点**: `POST /api/railpass/reservation/plan`

**描述**: 为所有 rail segments 生成订座任务列表，评估违规，提供备用方案。

**请求体**:
```json
{
  "segments": [
    {
      "segmentId": "seg-1",
      "from": "Paris",
      "to": "London",
      "departureTime": "2026-07-15T09:00:00Z"
    }
  ],
  "passProfile": {
    "passFamily": "EURAIL",
    "passType": "GLOBAL"
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "taskId": "task-1",
        "segmentId": "seg-1",
        "status": "NEEDED",
        "required": true,
        "fee": 30,
        "urgency": "HIGH",
        "bookingDeadline": "2026-05-15"
      }
    ],
    "violations": [],
    "alternatives": []
  }
}
```

---

### 5. 模拟 Travel Day 消耗

**端点**: `POST /api/railpass/travel-days/simulate`

**描述**: 计算 Flexi Pass 的 Travel Day 消耗（考虑跨午夜规则）。

**请求体**:
```json
{
  "segments": [
    {
      "segmentId": "seg-1",
      "departureTime": "2026-07-15T22:00:00Z",
      "arrivalTime": "2026-07-16T08:00:00Z",
      "crossesMidnight": true
    }
  ],
  "passProfile": {
    "passType": "GLOBAL",
    "passDuration": "FLEXI",
    "travelDays": 7
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "totalDaysUsed": 2,
    "daysRemaining": 5,
    "breakdown": [
      {
        "segmentId": "seg-1",
        "daysConsumed": 2,
        "reason": "跨午夜换乘消耗 2 个 travel day"
      }
    ],
    "warnings": []
  }
}
```

---

### 6. 验证合规性

**端点**: `POST /api/railpass/compliance/validate`

**描述**: 验证行程计划是否符合 RailPass 规则（居住国使用、Travel Day 预算、订座要求等）。

**请求体**:
```json
{
  "passProfile": {
    "passFamily": "INTERRAIL",
    "passType": "GLOBAL",
    "residencyCountry": "FR",
    "travelDays": 7
  },
  "segments": [
    {
      "segmentId": "seg-1",
      "from": "Paris",
      "to": "Lyon",
      "countryCode": "FR",
      "departureTime": "2026-07-15T09:00:00Z"
    }
  ],
  "reservationTasks": []
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "valid": false,
    "violations": [
      {
        "code": "RAILPASS_HOME_COUNTRY_OUTBOUND_EXCEEDED",
        "severity": "ERROR",
        "message": "Interrail 在居住国 FR 的 outbound 使用次数超限",
        "segmentId": "seg-1"
      }
    ],
    "warnings": [],
    "explanation": "您的行程违反了 Interrail 居住国使用规则..."
  }
}
```

---

### 7. 检查 Pass 覆盖

**端点**: `POST /api/railpass/coverage/check`

**描述**: 检查 rail segment 是否在 Pass 覆盖范围内。Global Pass 不是 100% 覆盖所有线路，需要校验运营商/线路是否被覆盖。城市地铁/公交/有轨电车通常不包含。

**请求体**:
```json
{
  "segment": {
    "from": "Paris Gare du Nord",
    "to": "Paris CDG Airport",
    "operator": "RER B",
    "countryCode": "FR"
  },
  "passProfile": {
    "passFamily": "EURAIL",
    "passType": "GLOBAL"
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "covered": false,
    "status": "NOT_COVERED",
    "explanation": "RER B 是城市轨道交通，不在 Global Pass 覆盖范围内",
    "includesCityTransport": true,
    "alternatives": [
      {
        "type": "METRO",
        "description": "使用 RER B 单程票",
        "estimatedCost": 10.3,
        "estimatedTimeMinutes": 35
      }
    ]
  }
}
```

---

### 8. 获取订座渠道策略

**端点**: `POST /api/railpass/reservation/channels`

**描述**: 根据国家/运营商获取订座渠道策略和订座清单。不同国家/运营商有不同的订座渠道（官方平台/运营商官网/车站/第三方）。

**请求体**:
```json
{
  "segments": [
    {
      "segmentId": "seg-1",
      "from": "Paris",
      "to": "London",
      "operator": "Eurostar",
      "countryCode": "FR"
    }
  ]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": [
    {
      "segmentId": "seg-1",
      "from": "Paris",
      "to": "London",
      "policy": {
        "countryCode": "FR",
        "operator": "Eurostar",
        "preferredChannels": ["online", "official_website"],
        "supportsApiBooking": false,
        "supportsOnlineBooking": true,
        "requiresOfflineBooking": false,
        "bookingUrl": "https://www.eurostar.com",
        "instructions": "请提前 60 天预订，建议在 Eurostar 官网预订",
        "recommendedAdvanceDays": 60
      },
      "urgency": "HIGH",
      "bookingDeadline": "2026-05-15"
    }
  ]
}
```

---

### 9. 评估规则

**端点**: `POST /api/railpass/rules/evaluate`

**描述**: 使用规则引擎评估所有 RailPass 规则。统一的规则引擎结构，支持扩展不同 Pass 类型（Eurail/Interrail/未来 JR Pass 等）。每条规则都有 Condition、Effect、Severity、Evidence 结构。

**请求体**:
```json
{
  "passProfile": {
    "passFamily": "EURAIL",
    "passType": "GLOBAL",
    "passDuration": "FLEXI",
    "travelDays": 7,
    "residencyCountry": "CN"
  },
  "segments": [
    {
      "segmentId": "seg-1",
      "from": "Paris",
      "to": "London",
      "departureTime": "2026-07-15T22:00:00Z",
      "arrivalTime": "2026-07-16T08:00:00Z",
      "requiresReservation": true,
      "reservationBooked": false
    }
  ]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "triggeredRules": [
      {
        "rule": {
          "id": "RESERVATION_REQUIRED",
          "name": "订座要求",
          "description": "夜车和高铁必须订座"
        },
        "segmentId": "seg-1",
        "effect": {
          "type": "ERROR",
          "value": 0,
          "riskLevel": "HIGH",
          "fallbackOptions": ["SWITCH_TO_DAY_TRAIN", "BOOK_RESERVATION"],
          "errorMessage": "该段必须订座但尚未预订"
        },
        "message": "seg-1 需要订座但未预订，违反 RailPass 规则"
      },
      {
        "rule": {
          "id": "TRAVEL_DAY_MIDNIGHT_TRANSFER",
          "name": "跨午夜换乘规则",
          "description": "跨午夜换乘消耗 2 个 travel day"
        },
        "segmentId": "seg-1",
        "effect": {
          "type": "TRAVEL_DAY_CONSUMPTION",
          "value": 2,
          "riskLevel": "MEDIUM",
          "fallbackOptions": [],
          "errorMessage": null
        },
        "message": "seg-1 跨午夜换乘，消耗 2 个 travel day"
      }
    ],
    "hasErrors": true,
    "overallRisk": "HIGH"
  }
}
```

---

### 10. 更新订座任务状态

**端点**: `PATCH /api/railpass/reservation/task/:taskId`

**描述**: 用户完成订座后回填状态（BOOKED/FAILED/FALLBACK_APPLIED）。

**请求体**:
```json
{
  "status": "BOOKED",
  "bookingReference": "ABC123",
  "bookingDate": "2026-05-10T10:00:00Z"
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "taskId": "task-1",
    "status": "BOOKED",
    "message": "任务状态已更新"
  }
}
```

---

### 11. 生成订座清单

**端点**: `POST /api/railpass/reservation/checkout`

**描述**: 生成外跳链接/或聚合指引，方便用户完成订座。

**请求体**:
```json
{
  "taskIds": ["task-1", "task-2"]
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "checkoutLinks": [
      {
        "taskId": "task-1",
        "bookingUrl": "https://example.com/book/task-1",
        "instructions": "请在此链接完成订座"
      }
    ]
  }
}
```

---

### 12. 可执行性检查

**端点**: `POST /api/railpass/executability/check`

**描述**: 生成可执行性检查总览，用于 UI 卡片展示。

**请求体**:
```json
{
  "tripId": "trip-123",
  "passProfile": {},
  "segments": [],
  "reservationTasks": []
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "executable": false,
    "summary": {
      "totalSegments": 10,
      "segmentsRequiringReservation": 3,
      "reservationsBooked": 1,
      "reservationsPending": 2,
      "travelDaysUsed": 5,
      "travelDaysRemaining": 2
    },
    "issues": [
      {
        "type": "RESERVATION_MISSING",
        "severity": "ERROR",
        "count": 2
      }
    ]
  }
}
```

---

### 13. 生成高风险提示

**端点**: `POST /api/railpass/executability/high-risk-alerts`

**描述**: 生成高风险提示及替代方案。

**请求体**: 同可执行性检查

**响应示例**:
```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "type": "QUOTA_RISK",
        "severity": "HIGH",
        "segmentId": "seg-1",
        "message": "Eurostar 订座配额紧张，建议提前 60 天预订",
        "alternatives": [
          {
            "type": "SWITCH_TO_DAY_TRAIN",
            "description": "改为日间车次"
          }
        ]
      }
    ]
  }
}
```

---

### 14. 完成 PassProfile 向导

**端点**: `POST /api/railpass/wizard/complete-profile`

**描述**: 通过最短 3 问完成 PassProfile 配置。

**请求体**:
```json
{
  "residencyCountry": "CN",
  "travelCountries": ["FR", "DE", "IT"],
  "estimatedRailSegments": 8,
  "tripDurationDays": 14
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "passProfile": {
      "passFamily": "EURAIL",
      "passType": "GLOBAL",
      "passDuration": "FLEXI",
      "travelDays": 7
    },
    "reasoning": "基于您的行程，推荐..."
  }
}
```

---

### 15. 改方案

**端点**: `POST /api/railpass/plan/regenerate`

**描述**: 根据策略重新生成方案（更稳/更省/更便宜）。

**请求体**:
```json
{
  "tripId": "trip-123",
  "strategy": "MORE_STABLE",
  "customParams": {},
  "passProfile": {},
  "segments": [],
  "reservationTasks": []
}
```

**参数说明**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| strategy | string | 是 | 策略：MORE_STABLE（更稳）, MORE_ECONOMICAL（更省）, MORE_AFFORDABLE（更便宜）, CUSTOM（自定义） |
| customParams | object | 否 | 自定义参数 |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "newPlan": {
      "segments": [],
      "reservationTasks": [],
      "improvements": [
        "减少了高风险订座段",
        "优化了 Travel Day 使用"
      ]
    }
  }
}
```

---

## 三、接口分类总结

### RAG 知识库接口（规则提取）
- `POST /api/rag/compliance/rail-pass` - 提取 Rail Pass 规则
- `POST /api/rag/compliance/refresh` - 刷新合规规则缓存

### RailPass 核心功能接口
- `POST /api/railpass/eligibility` - 合规检查
- `POST /api/railpass/recommendation` - Pass 推荐
- `POST /api/railpass/compliance/validate` - 合规验证
- `POST /api/railpass/rules/evaluate` - 规则评估

### 订座相关接口
- `POST /api/railpass/reservation/check` - 检查订座需求
- `POST /api/railpass/reservation/plan` - 规划订座任务
- `POST /api/railpass/reservation/channels` - 获取订座渠道
- `POST /api/railpass/reservation/checkout` - 生成订座清单
- `PATCH /api/railpass/reservation/task/:taskId` - 更新任务状态

### Travel Day 相关接口
- `POST /api/railpass/travel-days/simulate` - 模拟 Travel Day 消耗

### 覆盖检查接口
- `POST /api/railpass/coverage/check` - 检查 Pass 覆盖

### 可执行性检查接口
- `POST /api/railpass/executability/check` - 可执行性检查
- `POST /api/railpass/executability/high-risk-alerts` - 高风险提示

### 向导和方案生成接口
- `POST /api/railpass/wizard/complete-profile` - 完成 PassProfile 向导
- `POST /api/railpass/plan/regenerate` - 改方案

---

## 四、关键规则说明

### 1. Pass 家族规则
- **Eurail**: 非欧洲居住者使用
- **Interrail**: 欧洲居住者使用

### 2. 居住国使用限制（Interrail）
- Interrail 在居住国只能用 1 个 outbound + 1 个 inbound
- 都占用 travel day，不是额外赠送
- 同一天多次换乘仍算 1 travel day

### 3. Travel Day 规则（Flexi Pass）
- 不跨午夜换乘 → 1 travel day（出发日）
- 跨午夜换乘 → 2 天（出发日 + 到达日）
- 最后一天不能乘坐跨日夜车（Pass 在 23:59 过期）

### 4. 订座规则
- 夜车强制订座
- 高铁/国际列车多数需要订座
- 必须订座但未订 → error（不可执行）
- 配额紧张 → risk=high

### 5. Pass 覆盖规则
- Global Pass 不是 100% 覆盖所有线路
- 城市地铁/公交/有轨电车通常不包含
- One Country Pass 不能用于跨境段

---

## 五、错误码说明

| 错误码 | 说明 |
|--------|------|
| RAILPASS_RESERVATION_MANDATORY | 必须订座但未订 |
| RAILPASS_HOME_COUNTRY_OUTBOUND_EXCEEDED | Interrail 居住国 outbound 超限 |
| RAILPASS_HOME_COUNTRY_INBOUND_EXCEEDED | Interrail 居住国 inbound 超限 |
| RAILPASS_TRAVEL_DAY_BUDGET_EXCEEDED | Travel Day 预算超限 |
| RAILPASS_COVERAGE_NOT_COVERED | Pass 不覆盖该段 |
| RAILPASS_LAST_DAY_NIGHT_TRAIN | 最后一天不能乘坐夜车 |

---

## 六、参考文档

- [RailPass README](../railpass/README.md)
- [RailPass 规则总结](../railpass/RULES_SUMMARY.md)
- [RAG API 文档](./RAG_API_DOCUMENTATION.md)
