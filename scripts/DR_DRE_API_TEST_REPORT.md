# Dr.Dre View（节奏tab）接口测试报告

## 测试时间
2026-02-09

## 测试接口

### 1. 获取行程指标

**接口**: `GET /api/trips/:id/metrics`

**测试URL**: `http://localhost:3000/api/trips/6a227a13-b90a-4afb-85fd-d975c38779b7/metrics`

**状态**: ✅ 成功 (HTTP 200)

**响应结构**:
```json
{
  "success": true,
  "data": {
    "tripId": "6a227a13-b90a-4afb-85fd-d975c38779b7",
    "days": [
      {
        "date": "2026-02-11",
        "metrics": {
          "walk": 0,
          "drive": 0,
          "buffer": 0,
          "fatigue": 0,
          "ascent": 1200,
          "cost": 0,
          "travelByMode": {
            "walking": 0,
            "driving": 0,
            "transit": 0,
            "train": 0,
            "flight": 0,
            "ferry": 0,
            "bicycle": 0,
            "taxi": 0
          },
          "totalTravelTime": 0,
          "totalDistance": 0
        },
        "conflicts": []
      },
      {
        "date": "2026-02-12",
        "metrics": {
          "walk": 0,
          "drive": 0,
          "buffer": 60,
          "fatigue": 0,
          "ascent": 677,
          "cost": 0,
          "travelByMode": {...},
          "totalTravelTime": 0,
          "totalDistance": 0
        },
        "conflicts": [
          {
            "id": "time-conflict-15cfd709-b8f6-4d7a-a626-02e8488c279b-2f9fd9c8-7979-4375-bde2-bdc66b42d71e",
            "type": "TIME_CONFLICT",
            "severity": "HIGH",
            "title": "时间冲突",
            "description": "活动 \"索斯莫克\" 与 \"米湖\" 时间重叠",
            "affectedDays": ["2026-02-12"],
            "affectedItemIds": [
              "15cfd709-b8f6-4d7a-a626-02e8488c279b",
              "2f9fd9c8-7979-4375-bde2-bdc66b42d71e"
            ],
            "suggestions": [
              {
                "action": "调整时间",
                "description": "调整其中一个活动的开始或结束时间",
                "impact": "解决时间冲突，确保行程可行"
              }
            ]
          }
        ]
      }
    ],
    "summary": {
      "totalWalk": 0,
      "totalDrive": 0,
      "totalBuffer": 280,
      "totalFatigue": 0,
      "totalCost": 0,
      "averageWalkPerDay": 0,
      "averageDrivePerDay": 0
    }
  }
}
```

**关键字段验证**:
- ✅ `days`: 数组，包含每天的指标和 conflicts
- ✅ `days[].conflicts`: 数组，包含冲突信息
- ✅ `days[].conflicts[].affectedItemIds`: 数组，包含受影响的 item IDs
- ✅ `summary`: 对象，包含汇总指标（totalWalk, totalDrive, totalBuffer, totalFatigue 等）

**测试结果**: 
- 接口正常返回数据
- 数据结构符合预期
- conflicts 中包含 `affectedItemIds` 字段，可用于识别有问题的项

---

### 2. 获取决策日志

**接口**: `GET /api/trips/:id/decision-log`

**测试URL**: `http://localhost:3000/api/trips/6a227a13-b90a-4afb-85fd-d975c38779b7/decision-log?limit=100&offset=0`

**状态**: ✅ 成功 (HTTP 200)

**响应结构**:
```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 0,
    "limit": 100,
    "offset": 0
  }
}
```

**关键字段验证**:
- ✅ `items`: 数组，包含决策日志条目
- ✅ `total`: 总记录数
- ✅ `limit`: 返回数量限制
- ✅ `offset`: 偏移量

**决策日志条目结构**（当有数据时）:
```json
{
  "id": "log-id",
  "date": "2024-12-30T10:00:00Z",
  "description": "依据道路通行记录进行了风险提示",
  "source": "PHYSICAL",
  "persona": "DR_DRE",
  "action": "ADJUST" | "PACING_ADJUSTMENT",
  "metadata": {
    "reasonCodes": [],
    "evidenceRefs": []
  }
}
```

**测试结果**: 
- 接口正常返回数据
- 数据结构符合预期
- 当前测试 trip 没有决策日志记录（`items` 为空数组）
- 可以通过 `persona == "DR_DRE"` 和 `action == "ADJUST" | "PACING_ADJUSTMENT"` 过滤出 Dr.Dre 的调整操作

---

## 接口使用说明

### 前端调用示例

#### 1. 获取行程指标

```typescript
// src/pages/trips/[id].tsx
async function loadTripMetrics(id: string) {
  const response = await tripsApi.getMetrics(id);
  // response.data 包含:
  // - days: 每天的指标和 conflicts（包含 affectedItemIds）
  // - summary: 汇总指标
  return response.data;
}
```

#### 2. 获取决策日志

```typescript
// src/pages/trips/[id].tsx
async function loadDecisionLogs(id: string) {
  const response = await tripsApi.getDecisionLog(id, 100, 0);
  // response.data.items 包含决策日志列表
  
  // 提取 Dr.Dre 的 ADJUST 或 PACING_ADJUSTMENT 操作
  const drDreAdjusts = response.data.items.filter(
    item => 
      item.persona === 'DR_DRE' && 
      (item.action === 'ADJUST' || item.action === 'PACING_ADJUSTMENT')
  );
  
  return drDreAdjusts;
}
```

---

## 测试脚本

已创建测试脚本：`scripts/test-dr-dre-apis.sh`

**使用方法**:
```bash
# 使用默认 trip ID
./scripts/test-dr-dre-apis.sh

# 指定 trip ID
./scripts/test-dr-dre-apis.sh <trip-id>
```

---

## 总结

### ✅ 测试通过
1. **GET /api/trips/:id/metrics** - 成功返回行程指标数据
   - 包含每天的指标和 conflicts
   - conflicts 中包含 `affectedItemIds` 字段
   - 包含汇总指标

2. **GET /api/trips/:id/decision-log** - 成功返回决策日志数据
   - 数据结构正确
   - 支持分页（limit, offset）
   - 可以过滤出 Dr.Dre 的 ADJUST/PACING_ADJUSTMENT 操作

### 📝 注意事项
- 当前测试的 trip 没有决策日志记录，这是正常的（可能该 trip 还没有经过决策流程）
- 在实际使用中，需要确保 trip 已经经过决策流程，才会有决策日志记录
- `conflicts` 中的 `affectedItemIds` 可以用于识别有问题的 itinerary items

### 🔍 后续建议
- 可以使用有决策日志的 trip ID 进行更完整的测试
- 可以测试不同的 limit 和 offset 参数
- 可以测试过滤功能（如只获取特定 persona 或 action 的日志）
