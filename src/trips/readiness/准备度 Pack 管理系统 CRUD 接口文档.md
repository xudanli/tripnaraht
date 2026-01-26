# 准备度 Pack 管理系统 CRUD 接口文档

## 概述

准备度 Pack 管理系统提供完整的 CRUD 接口，用于管理 Readiness Pack 数据。所有接口都需要 `/api` 前缀。

**基础路径**: `/api/readiness/admin/packs`

---

## 接口列表

### 1. 获取 Pack 列表（分页、筛选、搜索）

**接口**: `GET /api/readiness/admin/packs`

**请求参数**（Query）:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| page | number | 否 | 页码，默认 1 | 1 |
| limit | number | 否 | 每页数量，默认 20 | 20 |
| countryCode | string | 否 | 国家代码筛选 | IS |
| destinationId | string | 否 | 目的地ID筛选 | IS-ICELAND |
| isActive | boolean | 否 | 是否激活筛选 | true |
| search | string | 否 | 搜索关键词（packId、displayName） | iceland |

**请求示例**:
```http
GET /api/readiness/admin/packs?page=1&limit=20&countryCode=IS&isActive=true
GET /api/readiness/admin/packs?search=iceland
```

**响应结构**:
```typescript
{
  success: true;
  data: {
    packs: ReadinessPackListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error: null;
}
```

**ReadinessPackListItem 结构**:
```typescript
{
  id: string;                    // 数据库ID
  packId: string;                // Pack标识符（如 pack.is.iceland）
  destinationId: string;         // 目的地ID（如 IS-ICELAND）
  displayName: string;           // 显示名称（默认）
  displayNameEN?: string;        // 显示名称（英文）
  displayNameCN?: string;       // 显示名称（中文）
  version: string;               // 版本号
  lastReviewedAt: Date;         // 最后审核时间
  countryCode: string;           // 国家代码
  region?: string;              // 区域（默认）
  regionEN?: string;            // 区域（英文）
  regionCN?: string;             // 区域（中文）
  city?: string;                 // 城市（默认）
  cityEN?: string;              // 城市（英文）
  cityCN?: string;              // 城市（中文）
  isActive: boolean;            // 是否激活
  createdAt: Date;              // 创建时间
  updatedAt: Date;              // 更新时间
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "packs": [
      {
        "id": "uuid-here",
        "packId": "pack.is.iceland",
        "destinationId": "IS-ICELAND",
        "displayName": "Iceland Travel Readiness",
        "displayNameEN": "Iceland Travel Readiness",
        "displayNameCN": "冰岛旅行准备度",
        "version": "1.0.0",
        "lastReviewedAt": "2025-12-20T00:00:00.000Z",
        "countryCode": "IS",
        "region": "Iceland",
        "regionEN": "Iceland",
        "regionCN": "冰岛",
        "city": "Reykjavik",
        "cityEN": "Reykjavik",
        "cityCN": "雷克雅未克",
        "isActive": true,
        "createdAt": "2025-01-01T00:00:00.000Z",
        "updatedAt": "2025-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  },
  "error": null
}
```

---

### 2. 获取 Pack 详情

**接口**: `GET /api/readiness/admin/packs/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | Pack ID（packId），如 `pack.is.iceland` |

**请求示例**:
```http
GET /api/readiness/admin/packs/pack.is.iceland
```

**响应结构**:
```typescript
{
  success: true;
  data: ReadinessPack & {
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  error: null;
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "packId": "pack.is.iceland",
    "destinationId": "IS-ICELAND",
    "displayName": "Iceland Travel Readiness",
    "version": "1.0.0",
    "lastReviewedAt": "2025-12-20T00:00:00.000Z",
    "geo": {
      "countryCode": "IS",
      "region": "Iceland",
      "city": "Reykjavik",
      "lat": 64.1265,
      "lng": -21.8174
    },
    "supportedSeasons": ["summer", "winter", "transition"],
    "sources": [...],
    "rules": [...],
    "checklists": [...],
    "hazards": [...],
    "isActive": true,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "error": null
}
```

---

### 3. 创建 Pack

**接口**: `POST /api/readiness/admin/packs`

**请求体**:
```typescript
{
  pack: ReadinessPack;  // 完整的 Pack 数据对象
}
```

**请求示例**:
```json
{
  "pack": {
    "packId": "pack.is.iceland",
    "destinationId": "IS-ICELAND",
    "displayName": "Iceland Travel Readiness",
    "version": "1.0.0",
    "lastReviewedAt": "2025-12-20T00:00:00.000Z",
    "geo": {
      "countryCode": "IS",
      "region": "Iceland",
      "city": "Reykjavik",
      "lat": 64.1265,
      "lng": -21.8174
    },
    "supportedSeasons": ["summer", "winter", "transition"],
    "sources": [...],
    "rules": [...],
    "checklists": [...],
    "hazards": [...]
  }
}
```

**响应结构**:
```typescript
{
  success: true;
  data: ReadinessPack;  // 创建后的完整 Pack 数据
  error: null;
}
```

**错误响应**（如果 packId 已存在）:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Pack already exists"
  }
}
```

---

### 4. 更新 Pack

**接口**: `PUT /api/readiness/admin/packs/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | Pack ID（packId），如 `pack.is.iceland` |

**请求体**:
```typescript
{
  pack?: ReadinessPack;      // 可选的 Pack 数据（更新时提供）
  isActive?: boolean;        // 可选的激活状态
}
```

**请求示例**:
```json
{
  "pack": {
    "packId": "pack.is.iceland",
    "destinationId": "IS-ICELAND",
    "displayName": "Iceland Travel Readiness (Updated)",
    "version": "1.1.0",
    // ... 其他字段
  },
  "isActive": true
}
```

**或者只更新状态**:
```json
{
  "isActive": false
}
```

**响应结构**:
```typescript
{
  success: true;
  data: ReadinessPack & {
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  error: null;
}
```

**错误响应**（如果 Pack 不存在）:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Readiness pack not found: pack.is.iceland"
  }
}
```

---

### 5. 删除 Pack（软删除）

**接口**: `DELETE /api/readiness/admin/packs/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | Pack ID（packId），如 `pack.is.iceland` |

**说明**: 此接口执行软删除，将 `isActive` 设置为 `false`，不会真正删除数据库记录。

**请求示例**:
```http
DELETE /api/readiness/admin/packs/pack.is.iceland
```

**响应结构**:
```typescript
{
  success: true;
  data: {
    packId: string;
    deleted: boolean;
  };
  error: null;
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "packId": "pack.is.iceland",
    "deleted": true
  },
  "error": null
}
```

**错误响应**（如果 Pack 不存在）:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Readiness pack not found: pack.is.iceland"
  }
}
```

---

## 数据导入接口（建议）

虽然当前没有专门的导入接口，但可以通过以下方式导入 JSON 文件：

### 方法 1: 使用创建接口

1. 读取 JSON 文件内容
2. 调用 `POST /api/readiness/admin/packs` 接口

**示例脚本**:
```typescript
import axios from 'axios';
import { readFileSync } from 'fs';

const packData = JSON.parse(readFileSync('src/trips/readiness/data/packs/pack.is.iceland.json', 'utf-8'));

const response = await axios.post('http://localhost:3000/api/readiness/admin/packs', {
  pack: packData
});

console.log(response.data);
```

### 方法 2: 使用后端服务方法（内部）

后端 `PackStorageService` 提供了导入方法：

```typescript
// 从文件导入
await packStorageService.importPackFromFile('src/trips/readiness/data/packs/pack.is.iceland.json');

// 从目录批量导入
await packStorageService.importPacksFromDirectory('src/trips/readiness/data/packs');
```

---

## 批量操作建议

### 批量导入多个 Pack

可以创建一个脚本批量导入：

```typescript
import axios from 'axios';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const packsDir = 'src/trips/readiness/data/packs';
const files = readdirSync(packsDir).filter(f => f.endsWith('.json'));

for (const file of files) {
  const filePath = join(packsDir, file);
  const packData = JSON.parse(readFileSync(filePath, 'utf-8'));
  
  try {
    const response = await axios.post('http://localhost:3000/api/readiness/admin/packs', {
      pack: packData
    });
    console.log(`✅ Imported: ${packData.packId}`);
  } catch (error: any) {
    if (error.response?.status === 400 && error.response?.data?.error?.message?.includes('already exists')) {
      console.log(`⚠️  Already exists: ${packData.packId}`);
    } else {
      console.error(`❌ Failed to import ${packData.packId}:`, error.message);
    }
  }
}
```

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| NOT_FOUND | 404 | Pack 不存在 |
| VALIDATION_ERROR | 400 | 请求数据验证失败 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

---

## 注意事项

1. **Pack ID 唯一性**: `packId` 必须唯一，如果已存在会返回错误
2. **软删除**: 删除操作是软删除，只设置 `isActive=false`，数据仍保留在数据库中
3. **数据验证**: 创建和更新时会验证 Pack 数据格式，确保必需字段存在
4. **版本管理**: 建议在更新时递增 `version` 字段
5. **权限控制**: 当前所有接口标记为 `@Public()`，生产环境应添加权限验证

---

## 相关文件

- **Controller**: `src/trips/readiness/readiness.controller.ts` (1200-1473行)
- **DTO**: `src/trips/readiness/dto/admin-pack.dto.ts`
- **Service**: `src/trips/readiness/storage/pack-storage.service.ts`
- **类型定义**: `src/trips/readiness/types/readiness-pack.types.ts`
- **导入指南**: `src/trips/readiness/HOW_TO_ADD_PACK.md`
