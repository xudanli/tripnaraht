# Trail API 测试指南

## 快速开始

### 1. 启动服务器

```bash
npm run dev
```

等待服务器启动完成（看到 `🚀 Application is running on: http://localhost:3000`）。

### 2. 运行测试脚本（推荐）

```bash
./scripts/test-trail-integration.sh
```

测试脚本会自动测试所有Trail相关接口。

### 3. 使用 Swagger UI 测试

1. 打开浏览器访问：`http://localhost:3000/api`
2. 找到 `徒步路线` 标签
3. 展开需要测试的接口
4. 点击 "Try it out"
5. 填写测试数据
6. 点击 "Execute"

---

## 接口测试清单

### 基础接口

#### 1. 查询Trail列表
```bash
curl -X GET "http://localhost:3000/trails" | jq
```

#### 2. 根据ID查询Trail
```bash
curl -X GET "http://localhost:3000/trails/1" | jq
```

### 核心功能接口

#### 3. 根据景点推荐Trail
```bash
curl -X POST "http://localhost:3000/trails/recommend-for-places" \
  -H "Content-Type: application/json" \
  -d '{
    "placeIds": [1, 2, 3],
    "preferOffRoad": true,
    "maxDifficulty": "MODERATE"
  }' | jq
```

#### 4. 识别Trail沿途的景点
```bash
curl -X GET "http://localhost:3000/trails/1/places-along?radiusKm=3" | jq
```

#### 5. 拆分长徒步路线
```bash
curl -X GET "http://localhost:3000/trails/1/split-segments?maxSegmentLengthKm=10" | jq
```

#### 6. 推荐配套服务
```bash
curl -X GET "http://localhost:3000/trails/1/support-services" | jq
```

#### 7. 检查Trail适合性
```bash
curl -X POST "http://localhost:3000/trails/1/check-suitability" \
  -H "Content-Type: application/json" \
  -d '{
    "max_daily_hp": 100,
    "walk_speed_factor": 1.0,
    "terrain_filter": "ALL"
  }' | jq
```

### 高级功能接口

#### 8. 智能路线规划
```bash
curl -X POST "http://localhost:3000/trails/smart-plan" \
  -H "Content-Type: application/json" \
  -d '{
    "placeIds": [1, 2, 3],
    "pacingConfig": {
      "max_daily_hp": 100,
      "walk_speed_factor": 1.0,
      "terrain_filter": "ALL"
    },
    "preferences": {
      "maxTotalDistanceKm": 30,
      "preferOffRoad": true,
      "allowSplit": true
    }
  }' | jq
```

#### 9. 开始实时轨迹追踪
```bash
curl -X POST "http://localhost:3000/trails/tracking/start" \
  -H "Content-Type: application/json" \
  -d '{
    "trailId": 1,
    "itineraryItemId": "optional-item-id"
  }' | jq
```

**保存返回的 `sessionId` 用于后续操作**

#### 10. 添加追踪点
```bash
# 使用上面返回的sessionId
curl -X POST "http://localhost:3000/trails/tracking/{sessionId}/point" \
  -H "Content-Type: application/json" \
  -d '{
    "latitude": 27.5,
    "longitude": 114.2,
    "elevation": 1200,
    "accuracy": 10,
    "speed": 1.2
  }' | jq
```

#### 11. 获取追踪状态
```bash
curl -X GET "http://localhost:3000/trails/tracking/{sessionId}" | jq
```

#### 12. 结束追踪
```bash
curl -X POST "http://localhost:3000/trails/tracking/{sessionId}/stop" | jq
```

### 行程分享接口

#### 13. 创建行程分享
```bash
curl -X POST "http://localhost:3000/trips/{tripId}/share" \
  -H "Content-Type: application/json" \
  -d '{
    "permission": "VIEW",
    "expiresAt": "2024-12-31T23:59:59.000Z"
  }' | jq
```

**保存返回的 `shareToken` 用于后续操作**

#### 14. 获取分享的行程
```bash
curl -X GET "http://localhost:3000/trips/shared/{shareToken}" | jq
```

#### 15. 导入分享的行程
```bash
curl -X POST "http://localhost:3000/trips/shared/{shareToken}/import" \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "武功山",
    "startDate": "2024-05-01",
    "endDate": "2024-05-03",
    "userId": "optional-user-id"
  }' | jq
```

---

## 测试数据准备

### 创建测试Trail数据

如果数据库中没有Trail数据，可以使用GPX导入功能：

```bash
# 导入GPX文件创建Trail
npm run import:gpx -- docs/武功山.gpx --create-trail

# 或者导入其他GPX文件
npm run import:gpx -- docs/Tour_du_Mont_Blanc_TMB.gpx --create-trail
```

### 获取测试用的Place ID

```bash
# 查询Place列表
curl -X GET "http://localhost:3000/places?limit=10" | jq '.[] | {id, nameCN, nameEN}'
```

### 创建测试行程

```bash
# 创建测试行程
curl -X POST "http://localhost:3000/trips" \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "测试目的地",
    "startDate": "2024-05-01",
    "endDate": "2024-05-03",
    "budgetConfig": {
      "totalBudget": 10000,
      "currency": "CNY"
    },
    "pacingConfig": {
      "max_daily_hp": 100,
      "walk_speed_factor": 1.0
    }
  }' | jq
```

---

## 完整测试流程示例

### 场景：测试智能路线规划 + 实时追踪

```bash
# 1. 获取Place ID
PLACE_IDS=$(curl -s -X GET "http://localhost:3000/places?limit=3" | jq -r '.[0:3] | map(.id) | @json')

# 2. 智能路线规划
PLAN_RESPONSE=$(curl -s -X POST "http://localhost:3000/trails/smart-plan" \
  -H "Content-Type: application/json" \
  -d "{
    \"placeIds\": $PLACE_IDS,
    \"pacingConfig\": {
      \"max_daily_hp\": 100,
      \"walk_speed_factor\": 1.0
    }
  }")

echo "$PLAN_RESPONSE" | jq

# 3. 获取推荐的Trail ID
TRAIL_ID=$(echo "$PLAN_RESPONSE" | jq -r '.trails[0].trailId // empty')

if [ -n "$TRAIL_ID" ] && [ "$TRAIL_ID" != "null" ]; then
    # 4. 开始追踪
    TRACK_START=$(curl -s -X POST "http://localhost:3000/trails/tracking/start" \
      -H "Content-Type: application/json" \
      -d "{\"trailId\": $TRAIL_ID}")
    
    SESSION_ID=$(echo "$TRACK_START" | jq -r '.sessionId')
    echo "追踪会话ID: $SESSION_ID"
    
    # 5. 添加几个追踪点
    for i in {1..3}; do
        curl -s -X POST "http://localhost:3000/trails/tracking/$SESSION_ID/point" \
          -H "Content-Type: application/json" \
          -d "{
            \"latitude\": $(echo "27.5 + $i * 0.01" | bc),
            \"longitude\": $(echo "114.2 + $i * 0.01" | bc),
            \"elevation\": $((1200 + i * 10))
          }" | jq
        sleep 1
    done
    
    # 6. 获取追踪状态
    curl -s -X GET "http://localhost:3000/trails/tracking/$SESSION_ID" | jq
    
    # 7. 结束追踪
    curl -s -X POST "http://localhost:3000/trails/tracking/$SESSION_ID/stop" | jq
fi
```

---

## 常见问题

### Q: 提示 "Trail不存在"
**A**: 需要先创建Trail数据，可以使用 `npm run import:gpx` 导入GPX文件。

### Q: 提示 "Place不存在"
**A**: 需要先创建Place数据，或使用数据库中已存在的Place ID。

### Q: 追踪会话不存在
**A**: 确保先调用 `POST /trails/tracking/start` 创建会话，并使用返回的 `sessionId`。

### Q: 分享链接已过期
**A**: 创建分享时可以设置 `expiresAt`，或创建新的分享链接。

---

## 测试检查清单

- [ ] 服务器运行正常
- [ ] 数据库中有Trail数据
- [ ] 数据库中有Place数据
- [ ] 可以查询Trail列表
- [ ] 可以根据景点推荐Trail
- [ ] 可以识别Trail沿途的景点
- [ ] 可以推荐配套服务
- [ ] 可以检查Trail适合性
- [ ] 可以智能路线规划
- [ ] 可以实时轨迹追踪
- [ ] 可以创建和导入行程分享

---

## 性能测试

### 批量测试追踪点添加

```bash
SESSION_ID="your-session-id"
for i in {1..100}; do
    curl -s -X POST "http://localhost:3000/trails/tracking/$SESSION_ID/point" \
      -H "Content-Type: application/json" \
      -d "{
        \"latitude\": $(echo "27.5 + $i * 0.001" | bc),
        \"longitude\": $(echo "114.2 + $i * 0.001" | bc)
      }" > /dev/null
    echo "添加第 $i 个点"
done
```

### 压力测试

可以使用 `ab` 或 `wrk` 工具进行压力测试：

```bash
# 使用ab测试
ab -n 1000 -c 10 -p request.json -T application/json \
  http://localhost:3000/trails/recommend-for-places
```

