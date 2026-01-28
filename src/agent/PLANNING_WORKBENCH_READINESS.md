# 规划工作台准备度入口

## 概述

规划工作台现在集成了准备度检查功能，用户可以直接从规划工作台访问行程的准备度信息。

## 新增接口

### 1. 获取行程准备度检查结果

**接口**: `GET /api/planning-workbench/trips/:tripId/readiness`

**描述**: 从规划工作台获取指定行程的准备度检查结果，包括 must/should/optional 清单和风险预警。

**参数**:
- `tripId` (路径参数): 行程 ID
- `lang` (查询参数, 可选): 语言，支持 `en` 或 `zh`，默认为 `en`

**响应示例**:
```json
{
  "success": true,
  "data": {
    "findings": [
      {
        "destinationId": "IS",
        "packId": "pack.is.iceland",
        "blockers": [],
        "must": [
          {
            "id": "must-1",
            "message": "准备冬季驾驶装备",
            "category": "gear",
            "tasks": []
          }
        ],
        "should": [],
        "optional": []
      }
    ],
    "summary": {
      "totalBlockers": 0,
      "totalMust": 5,
      "totalShould": 3,
      "totalOptional": 2
    },
    "readinessUrl": "/api/readiness/trip/{tripId}",
    "quickLinks": {
      "personalizedChecklist": "/api/readiness/personalized-checklist?tripId={tripId}",
      "riskWarnings": "/api/readiness/risk-warnings?tripId={tripId}",
      "readinessScore": "/api/readiness/trip/{tripId}/score",
      "coverageMap": "/api/readiness/trip/{tripId}/coverage-map"
    }
  }
}
```

### 2. 获取行程准备度分数链接

**接口**: `GET /api/planning-workbench/trips/:tripId/readiness/score`

**描述**: 获取准备度分数相关的 API 链接（实际调用 `/api/readiness/trip/:tripId/score`）。

**参数**:
- `tripId` (路径参数): 行程 ID

**响应示例**:
```json
{
  "success": true,
  "data": {
    "message": "请使用准备度 API 获取详细分数",
    "readinessScoreUrl": "/api/readiness/trip/{tripId}/score",
    "readinessChecklistUrl": "/api/readiness/personalized-checklist?tripId={tripId}",
    "readinessRiskWarningsUrl": "/api/readiness/risk-warnings?tripId={tripId}",
    "readinessCoverageMapUrl": "/api/readiness/trip/{tripId}/coverage-map"
  }
}
```

## 使用场景

### 场景 1: 在规划工作台查看准备度

用户在规划工作台生成行程方案后，可以点击"查看准备度"按钮，调用：
```
GET /api/planning-workbench/trips/{tripId}/readiness
```

### 场景 2: 获取准备度快速链接

前端可以调用准备度分数接口获取所有准备度相关的 API 链接：
```
GET /api/planning-workbench/trips/{tripId}/readiness/score
```

然后根据用户操作跳转到相应的准备度页面。

## 前端集成建议

### 1. 在规划工作台界面添加准备度入口

```typescript
// 在行程详情卡片中添加"准备度检查"按钮
<Button onClick={() => {
  fetch(`/api/planning-workbench/trips/${tripId}/readiness`)
    .then(res => res.json())
    .then(data => {
      // 显示准备度结果
      showReadinessModal(data.data);
    });
}}>
  查看准备度
</Button>
```

### 2. 显示准备度摘要

```typescript
// 显示准备度摘要卡片
const ReadinessSummary = ({ tripId }) => {
  const [readiness, setReadiness] = useState(null);
  
  useEffect(() => {
    fetch(`/api/planning-workbench/trips/${tripId}/readiness`)
      .then(res => res.json())
      .then(data => setReadiness(data.data));
  }, [tripId]);
  
  if (!readiness) return null;
  
  return (
    <Card>
      <CardHeader>准备度检查</CardHeader>
      <CardContent>
        <div>阻塞项: {readiness.summary.totalBlockers}</div>
        <div>必须项: {readiness.summary.totalMust}</div>
        <div>建议项: {readiness.summary.totalShould}</div>
        <Button href={readiness.readinessUrl}>查看详情</Button>
      </CardContent>
    </Card>
  );
};
```

## 相关 API

规划工作台的准备度接口是对准备度 API 的便捷封装。完整的准备度功能请参考：

- **准备度检查**: `/api/readiness/trip/:id`
- **个性化清单**: `/api/readiness/personalized-checklist?tripId=:tripId`
- **风险预警**: `/api/readiness/risk-warnings?tripId=:tripId`
- **准备度分数**: `/api/readiness/trip/:tripId/score`
- **覆盖地图**: `/api/readiness/trip/:tripId/coverage-map`

详细文档请参考：[准备度 API 文档](../trips/readiness/READINESS_API.md)

## 注意事项

1. **服务依赖**: 如果 `ReadinessModule` 未正确导入，准备度接口会返回错误提示
2. **PrismaService**: 需要确保 `PrismaModule` 已导入到 `AgentModule`
3. **语言支持**: 支持 `en` 和 `zh` 两种语言，默认使用 `en`

## 错误处理

如果准备度服务未启用，接口会返回：
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "准备度服务未启用，请检查 ReadinessModule 是否正确导入"
  }
}
```
