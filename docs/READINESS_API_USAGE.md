# Readiness API 使用指南

## 概述

Readiness API 提供了旅行准备度检查的能力，支持基于地理特征和 POI 数据的智能规则触发。

## API 端点

### 1. 检查准备度

**端点**: `POST /readiness/check`

**描述**: 基于目的地和行程信息，检查旅行准备度并返回 must/should/optional 清单。

**请求体**:
```json
{
  "destinationId": "NO-NORWAY",
  "traveler": {
    "nationality": "CN",
    "budgetLevel": "medium",
    "riskTolerance": "medium"
  },
  "trip": {
    "startDate": "2025-01-15",
    "endDate": "2025-01-22"
  },
  "itinerary": {
    "countries": ["NO"],
    "activities": ["self_drive", "aurora"],
    "season": "winter",
    "region": "Tromsø",
    "hasSeaCrossing": true,
    "hasAuroraActivity": true
  },
  "geo": {
    "lat": 69.6492,
    "lng": 18.9553,
    "enhanceWithGeo": true
  }
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "findings": [
      {
        "destinationId": "NO-NORWAY",
        "packId": "pack.no.norway",
        "blockers": [],
        "must": [
          {
            "id": "rule.no.ferry.dependent",
            "category": "logistics",
            "level": "must",
            "message": "路线依赖渡轮，需预留排队时间并准备备选方案...",
            "tasks": [...]
          }
        ],
        "should": [
          {
            "id": "rule.no.aurora.activity",
            "category": "gear_packing",
            "level": "should",
            "message": "极北地区冬季极光活动：光照短、风大体感低...",
            "tasks": [...]
          }
        ],
        "optional": [],
        "risks": [...]
      }
    ],
    "summary": {
      "totalBlockers": 0,
      "totalMust": 1,
      "totalShould": 1,
      "totalOptional": 0,
      "totalRisks": 2
    }
  }
}
```

### 2. 获取能力包列表

**端点**: `GET /readiness/capability-packs`

**描述**: 返回所有可用的能力包信息。

**响应**:
```json
{
  "success": true,
  "data": {
    "packs": [
      {
        "type": "high_altitude",
        "displayName": "High Altitude Travel Readiness",
        "description": "适用于海拔 2500m 以上的高海拔地区"
      },
      {
        "type": "sparse_supply",
        "displayName": "Sparse Supply Area Readiness",
        "description": "适用于补给稀疏的长距离路线"
      },
      {
        "type": "seasonal_road",
        "displayName": "Seasonal Road Closure Readiness",
        "description": "适用于冬季山地/山口路线"
      },
      {
        "type": "permit_checkpoint",
        "displayName": "Permit & Checkpoint Readiness",
        "description": "适用于需要许可或检查站的地区"
      },
      {
        "type": "emergency",
        "displayName": "Emergency Preparedness Readiness",
        "description": "适用于偏远、高海拔、长距离无人区"
      }
    ]
  }
}
```

### 3. 评估能力包

**端点**: `POST /readiness/capability-packs/evaluate`

**描述**: 评估哪些能力包应该被触发。

**请求体**: 同 `/readiness/check`

**响应**:
```json
{
  "success": true,
  "data": {
    "total": 5,
    "triggered": 2,
    "results": [
      {
        "packType": "seasonal_road",
        "triggered": true,
        "rules": [
          {
            "id": "rule.seasonal.mountain.pass",
            "triggered": true,
            "level": "must",
            "message": "冬季山口可能封闭..."
          }
        ],
        "hazards": [...]
      },
      {
        "packType": "emergency",
        "triggered": true,
        "rules": [...],
        "hazards": [...]
      }
    ]
  }
}
```

## 使用示例

### 示例 1: 检查挪威冬季自驾准备度

```bash
curl -X POST http://localhost:3000/readiness/check \
  -H "Content-Type: application/json" \
  -d '{
    "destinationId": "NO-NORWAY",
    "traveler": {
      "nationality": "CN"
    },
    "trip": {
      "startDate": "2025-01-15"
    },
    "itinerary": {
      "countries": ["NO"],
      "activities": ["self_drive"],
      "season": "winter"
    },
    "geo": {
      "lat": 62.4722,
      "lng": 6.1549,
      "enhanceWithGeo": true
    }
  }'
```

### 示例 2: 评估能力包

```bash
curl -X POST http://localhost:3000/readiness/capability-packs/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "destinationId": "NO-NORWAY",
    "itinerary": {
      "countries": ["NO"],
      "activities": ["self_drive"],
      "season": "winter"
    },
    "geo": {
      "lat": 69.6492,
      "lng": 18.9553
    }
  }'
```

## 挪威规则触发条件

### 渡轮依赖规则
- **触发**: `hasSeaCrossing: true` + 有 `FERRY_TERMINAL` 或 `PIER_DOCK` POI
- **输出**: 必须查询渡轮时刻表、准备备选码头

### 冬季山口自驾规则
- **触发**: `season: "winter"` + `activities: ["self_drive"]` + 山地
- **输出**: 必须检查山口开放状态、准备冬季轮胎

### 极北极光活动规则
- **触发**: `region: "Tromsø"` 或纬度 > 69 + `season: "winter"` + `hasAuroraActivity: true`
- **输出**: 建议保暖装备、相机防潮设备

### 徒步入口规则
- **触发**: `activities: ["hiking"]` + 附近有 `trailhead` POI
- **输出**: 必须查询路线难度、下载离线地图

## 能力包自动触发

系统会自动评估以下能力包：

1. **High Altitude Pack**: 海拔 >= 2500m
2. **Sparse Supply Pack**: 道路密度低 + 补给点稀少 + 路线长
3. **Seasonal Road Pack**: 山地 + 冬季
4. **Permit Checkpoint Pack**: 需要许可的国家或活动
5. **Emergency Pack**: 偏远 + 无医院 + 长距离

## 性能优化

- **缓存**: 地理特征查询结果会缓存 1 小时
- **异步**: 多个地理特征查询并行执行
- **可选增强**: 可以通过 `enhanceWithGeo: false` 禁用地理特征增强

## 错误处理

所有 API 端点都返回标准格式：

```json
{
  "success": false,
  "error": {
    "code": "READINESS_CHECK_FAILED",
    "message": "错误描述"
  }
}
```

## 相关文档

- [挪威规则测试指南](./NORWAY_RULES_TESTING.md)
- [能力包使用指南](./CAPABILITY_PACKS_GUIDE.md)
- [POI 数据集成总结](./POI_DATA_INTEGRATION_SUMMARY.md)

