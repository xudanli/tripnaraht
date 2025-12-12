# AllTrails 数据存储说明

## 📊 数据存储位置

冰岛（以及其他 AllTrails）导入的数据存储在 **`Place`** 表中。

## 📋 表结构

### Place 表

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | Int | 主键，自增 |
| `uuid` | String | 唯一标识符 |
| `nameCN` | String | 中文名称（主要显示） |
| `nameEN` | String? | 英文名称 |
| `category` | PlaceCategory | 类别（AllTrails 数据为 `ATTRACTION`） |
| `address` | String? | 地址（存储 location 信息） |
| `rating` | Float? | 评分 |
| `metadata` | Json? | **存储 AllTrails 原始数据** |
| `physicalMetadata` | Json? | **存储疲劳相关数据**（距离、海拔等） |
| `createdAt` | DateTime | 创建时间 |
| `updatedAt` | DateTime | 更新时间 |

## 📦 数据存储格式

### metadata 字段（JSON）

存储 AllTrails 的完整原始数据：

```json
{
  "source": "alltrails",
  "sourceUrl": "https://www.alltrails.com/trail/iceland/...",
  "name": "Trail Name",
  "location": "Iceland",
  "rating": "4.7",
  "description": "...",
  "length": "3.4 km",
  "elevationGain": "133 m",
  "estimatedTime": "1–1.5 hr",
  "crawledAt": "2024-12-12T...",
  "difficultyMetadata": {
    "level": "MODERATE",
    "source": "alltrails",
    "confidence": 0.9,
    "riskFactors": [],
    "requiresEquipment": false,
    "requiresGuide": false
  }
}
```

### physicalMetadata 字段（JSON）

存储疲劳相关数据：

```json
{
  "totalDistance": 3.4,
  "elevationGain": 133,
  "maxElevation": null,
  "source": "alltrails",
  "visitDuration": "1–1.5 hr hours"
}
```

## 🔍 查询数据

### 查询所有 AllTrails 数据

```sql
SELECT 
  id,
  "nameCN",
  "nameEN",
  category,
  address,
  rating,
  metadata->>'sourceUrl' as source_url,
  metadata->>'source' as source,
  "createdAt"
FROM "Place"
WHERE metadata->>'source' = 'alltrails'
ORDER BY "createdAt" DESC;
```

### 查询冰岛的数据

```sql
SELECT 
  id,
  "nameCN",
  "nameEN",
  address,
  rating,
  metadata->>'sourceUrl' as source_url,
  physical_metadata->>'totalDistance' as distance_km,
  physical_metadata->>'elevationGain' as elevation_m
FROM "Place"
WHERE metadata->>'source' = 'alltrails'
  AND (metadata->>'sourceUrl' LIKE '%iceland%' 
       OR address ILIKE '%iceland%')
ORDER BY "createdAt" DESC;
```

### 使用 Prisma 查询

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 查询所有 AllTrails 数据
const alltrailsPlaces = await prisma.place.findMany({
  where: {
    metadata: {
      path: ['source'],
      equals: 'alltrails',
    },
  } as any,
  orderBy: {
    createdAt: 'desc',
  },
});
```

## 📝 数据去重机制

导入脚本通过 `sourceUrl` 检查重复：

```typescript
const existing = await prisma.place.findFirst({
  where: {
    metadata: {
      path: ['sourceUrl'],
      equals: data.metadata.sourceUrl,
    },
  } as any,
});
```

如果已存在相同的 `sourceUrl`，则跳过导入。

## 🗂️ 相关文件

- **导入脚本**: `scripts/import-alltrails-to-db.ts`
- **数据库 Schema**: `prisma/schema.prisma`
- **爬取脚本**: `scripts/scrape-alltrails.ts`

## 💡 提示

1. **数据完整性**：所有 AllTrails 原始数据都保存在 `metadata` 字段中
2. **查询性能**：`metadata` 字段有 GIN 索引，支持 JSON 路径查询
3. **数据更新**：如果需要更新数据，可以通过 `sourceUrl` 查找并更新

