# 推荐活动接口文档

## 接口概述

获取指定国家评分 4.0 以上的地点推荐。

## 接口信息

- **接口地址**: `/api/places/recommendations/activities`
- **请求方法**: `GET`
- **认证**: 无需认证（Public）

## 请求参数

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| countryCode | string | 是 | 国家代码（ISO 3166-1 alpha-2） | `IS`（冰岛）、`JP`（日本）、`CN`（中国） |
| category | string | 否 | 地点类别筛选 | `ATTRACTION`（景点）、`RESTAURANT`（餐厅）、`SHOPPING`（购物）、`HOTEL`（酒店）、`TRANSIT_HUB`（交通枢纽）、`HOSPITAL`（医疗） |
| limit | number | 否 | 返回数量限制，默认 20，最大 100 | `50` |

### 地点类别枚举值

- `ATTRACTION` - 景点
- `RESTAURANT` - 餐厅
- `SHOPPING` - 购物
- `HOTEL` - 酒店
- `TRANSIT_HUB` - 交通枢纽
- `HOSPITAL` - 医疗

## 请求示例

```bash
# 获取冰岛所有评分4.0以上的地点
GET /api/places/recommendations/activities?countryCode=IS

# 获取日本评分4.0以上的景点
GET /api/places/recommendations/activities?countryCode=JP&category=ATTRACTION

# 获取中国评分4.0以上的餐厅，限制50条
GET /api/places/recommendations/activities?countryCode=CN&category=RESTAURANT&limit=50
```

## 响应格式

### 成功响应

```json
{
  "success": true,
  "data": [
    {
      "id": 123,
      "name": "Golden Circle",
      "nameCN": "黄金圈",
      "nameEN": "Golden Circle",
      "category": "ATTRACTION",
      "distance": 0,
      "isOpen": true,
      "tags": [],
      "address": "Iceland",
      "rating": 4.8,
      "status": {
        "isOpen": true,
        "text": "营业中",
        "hoursToday": "全天开放"
      }
    }
  ]
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "国家代码不能为空"
  }
}
```

## 响应字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | number | 地点ID |
| name | string | 显示名称（优先英文名，无则中文名） |
| nameCN | string | 中文名称 |
| nameEN | string \| null | 英文名称 |
| category | string | 地点类别 |
| distance | number | 距离（米），推荐接口固定为 0 |
| isOpen | boolean | 是否营业中 |
| tags | string[] | 标签列表 |
| address | string | 地址 |
| rating | number | 评分（>= 4.0） |
| status | object | 营业状态信息 |
| status.isOpen | boolean | 是否营业 |
| status.text | string | 营业状态文本 |
| status.hoursToday | string | 今日营业时间 |

## 前端调用示例

### JavaScript / TypeScript

```typescript
// 使用 fetch
async function getRecommendedActivities(countryCode: string, category?: string, limit?: number) {
  const params = new URLSearchParams({
    countryCode,
    ...(category && { category }),
    ...(limit && { limit: limit.toString() }),
  });
  
  const response = await fetch(`/api/places/recommendations/activities?${params}`);
  const result = await response.json();
  
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error.message);
  }
}

// 使用示例
const activities = await getRecommendedActivities('IS', 'ATTRACTION', 20);
```

### Axios

```typescript
import axios from 'axios';

async function getRecommendedActivities(countryCode: string, category?: string, limit?: number) {
  const response = await axios.get('/api/places/recommendations/activities', {
    params: {
      countryCode,
      category,
      limit,
    },
  });
  
  return response.data.data;
}
```

## 注意事项

1. `countryCode` 必须使用 ISO 3166-1 alpha-2 标准代码（2位大写字母）
2. 只返回评分 >= 4.0 的地点
3. 结果按评分降序排序，评分相同则按中文名称升序
4. `limit` 参数范围：1-100，超出范围会返回错误
5. 如果指定国家没有符合条件的地点，返回空数组

## 常见国家代码

| 国家 | 代码 |
|------|------|
| 冰岛 | IS |
| 日本 | JP |
| 中国 | CN |
| 美国 | US |
| 英国 | GB |
| 法国 | FR |
| 德国 | DE |
| 意大利 | IT |
| 西班牙 | ES |
