# 如何添加目的地 Readiness Pack

本文档说明如何为新的目的地创建和添加 Readiness Pack。

## 方法一：从 JSON 文件导入（推荐）

### 1. 创建 Pack JSON 文件

在 `src/trips/readiness/data/packs/` 目录下创建 JSON 文件，文件名格式：`{packId}.json`

例如：`pack.no.svalbard.longyearbyen.json`

### 2. Pack 文件结构

参考 `data/svalbard-pack.example.ts` 或以下模板：

```json
{
  "packId": "pack.no.svalbard.longyearbyen",
  "destinationId": "NO-SVALBARD-LYB",
  "displayName": "Svalbard (Longyearbyen) Travel Readiness",
  "version": "1.0.0",
  "lastReviewedAt": "2025-12-20T00:00:00Z",
  "geo": {
    "countryCode": "NO",
    "region": "Svalbard",
    "city": "Longyearbyen",
    "lat": 78.2232,
    "lng": 15.6469
  },
  "supportedSeasons": ["polar_night", "polar_day", "shoulder"],
  "sources": [
    {
      "sourceId": "src.governor.svalbard",
      "authority": "Governor of Svalbard",
      "type": "html",
      "title": "Safety/Travel information"
    }
  ],
  "rules": [
    {
      "id": "rule.sval.safety.no-solo-wilderness",
      "category": "safety_hazards",
      "severity": "high",
      "when": {
        "containsAny": {
          "path": "itinerary.activities",
          "values": ["hiking", "camping", "backcountry", "wildlife"]
        }
      },
      "then": {
        "level": "must",
        "message": "Avoid independent wilderness travel. Use certified guided tours.",
        "tasks": [
          {
            "title": "Book guided tours for wilderness activities",
            "dueOffsetDays": -21,
            "tags": ["booking", "safety"]
          }
        ]
      },
      "evidence": []
    }
  ],
  "checklists": [
    {
      "id": "chk.sval.safety",
      "category": "safety_hazards",
      "appliesToSeasons": ["all"],
      "items": [
        "Do not leave settlements without an appropriate safety plan",
        "Prefer guided activities for wilderness travel"
      ]
    }
  ],
  "hazards": [
    {
      "type": "wildlife",
      "severity": "high",
      "summary": "Polar bear risk outside settlements.",
      "mitigations": [
        "Avoid independent wilderness travel; join certified guided tours."
      ]
    }
  ]
}
```

### 3. 验证 Pack 文件

使用验证工具检查 Pack 文件：

```typescript
import { PackValidatorService } from './readiness/storage/pack-validator.service';

const validator = new PackValidatorService(packStorage);
const result = validator.validate(pack);

if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

### 4. 导入到数据库

#### 方法 A：使用 API（如果已实现）

```bash
POST /api/readiness/packs/import
{
  "filePath": "src/trips/readiness/data/packs/pack.no.svalbard.longyearbyen.json"
}
```

#### 方法 B：使用脚本

创建导入脚本 `scripts/import-readiness-pack.ts`：

```typescript
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { PackStorageService } from '../src/trips/readiness/storage/pack-storage.service';

const prisma = new PrismaClient();
const packStorage = new PackStorageService(prisma);

async function importPack(filePath: string) {
  const result = await packStorage.importPackFromFile(filePath);
  console.log(result ? '✅ Imported successfully' : '❌ Import failed');
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: ts-node import-readiness-pack.ts <file-path>');
  process.exit(1);
}

importPack(filePath)
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
```

运行：

```bash
ts-node scripts/import-readiness-pack.ts src/trips/readiness/data/packs/pack.no.svalbard.longyearbyen.json
```

#### 方法 C：批量导入目录

```typescript
const result = await packStorage.importPacksFromDirectory();
console.log(`Imported ${result.success} packs, ${result.failed} failed`);
```

## 方法二：直接通过数据库操作

### 1. 使用 Prisma Client

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const pack = {
  packId: 'pack.is.iceland',
  destinationId: 'IS-ICELAND',
  displayName: 'Iceland Travel Readiness',
  version: '1.0.0',
  lastReviewedAt: new Date('2025-12-20T00:00:00Z'),
  // ... 其他字段
};

await prisma.readinessPack.create({
  data: {
    packId: pack.packId,
    destinationId: pack.destinationId,
    displayName: pack.displayName,
    version: pack.version,
    lastReviewedAt: pack.lastReviewedAt,
    countryCode: pack.geo.countryCode,
    region: pack.geo.region,
    city: pack.geo.city,
    latitude: pack.geo.lat,
    longitude: pack.geo.lng,
    packData: pack as any, // 存储完整 Pack JSON
    isActive: true,
  },
});
```

### 2. 使用 SQL（不推荐，但可行）

```sql
INSERT INTO "ReadinessPack" (
  "id", "packId", "destinationId", "displayName", "version", 
  "lastReviewedAt", "countryCode", "region", "city", 
  "latitude", "longitude", "packData", "isActive", 
  "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  'pack.is.iceland',
  'IS-ICELAND',
  'Iceland Travel Readiness',
  '1.0.0',
  '2025-12-20T00:00:00Z'::timestamp,
  'IS',
  'Iceland',
  'Reykjavik',
  64.1265,
  -21.8174,
  '{"packId":"pack.is.iceland",...}'::jsonb,
  true,
  now(),
  now()
);
```

## Pack 字段说明

### 必需字段

- `packId`: 唯一标识符，格式：`pack.{country}.{region}.{city}`
- `destinationId`: 目的地标识，格式：`{COUNTRY}-{REGION}-{CITY}`
- `displayName`: 显示名称
- `version`: 语义化版本号（如 `1.0.0`）
- `lastReviewedAt`: 最后审核时间（ISO datetime）
- `geo`: 地理信息对象
  - `countryCode`: ISO 3166-1 alpha-2 国家代码
  - `region`: 地区/州/省（可选）
  - `city`: 城市（可选）
  - `lat`: 纬度（可选）
  - `lng`: 经度（可选）
- `supportedSeasons`: 支持的季节列表
- `rules`: 规则数组（至少一条）
- `checklists`: 清单数组（至少一条）

### 可选字段

- `sources`: 数据来源列表
- `hazards`: 风险列表

## 规则编写指南

### 条件操作符

- `all`: 所有条件都必须满足
- `any`: 任一条件满足即可
- `not`: 条件取反
- `exists`: 检查路径是否存在
- `eq`: 等于
- `in`: 在列表中
- `containsAny`: 数组包含任一值

### 示例规则

```json
{
  "id": "rule.example.visa-required",
  "category": "entry_transit",
  "severity": "high",
  "when": {
    "all": [
      { "eq": { "path": "traveler.nationality", "value": "CN" } },
      { "eq": { "path": "itinerary.countries", "value": ["US"] } }
    ]
  },
  "then": {
    "level": "must",
    "message": "中国公民前往美国需要办理签证",
    "tasks": [
      {
        "title": "办理美国签证",
        "dueOffsetDays": -45,
        "tags": ["visa"]
      }
    ],
    "askUser": ["您是否已有美国签证？"]
  },
  "evidence": [
    {
      "sourceId": "src.us.embassy",
      "sectionId": "visa-requirements",
      "quote": "中国公民需要B1/B2签证"
    }
  ]
}
```

## 验证和测试

### 1. 验证 Pack

```typescript
const validator = new PackValidatorService(packStorage);
const result = validator.validate(pack);

if (!result.valid) {
  console.error('Errors:', result.errors);
  console.warn('Warnings:', result.warnings);
}
```

### 2. 测试规则引擎

```typescript
const context: TripContext = {
  traveler: {
    nationality: 'CN',
    budgetLevel: 'medium',
    riskTolerance: 'medium',
  },
  trip: {
    startDate: '2026-01-15',
  },
  itinerary: {
    countries: ['IS'],
    activities: ['hiking', 'sightseeing'],
    season: 'winter',
  },
};

const result = await readinessService.checkFromDestination('IS-ICELAND', context);
console.log('Blockers:', result.findings[0].blockers);
console.log('Must:', result.findings[0].must);
```

## 更新现有 Pack

### 1. 更新版本号

遵循语义化版本：
- `1.0.0` → `1.0.1` (补丁：修复错误)
- `1.0.0` → `1.1.0` (小版本：新增规则)
- `1.0.0` → `2.0.0` (大版本：重大变更)

### 2. 更新 lastReviewedAt

每次更新时更新审核时间：

```json
{
  "version": "1.0.1",
  "lastReviewedAt": "2025-12-21T00:00:00Z"
}
```

### 3. 保存到数据库

使用 `savePack` 方法会自动更新现有记录：

```typescript
await packStorage.savePack(updatedPack);
```

## 常见问题

### Q: Pack 文件应该放在哪里？

A: 推荐放在 `src/trips/readiness/data/packs/` 目录下，作为版本控制和备份。实际运行时从数据库加载。

### Q: 如何禁用某个 Pack？

A: 使用 `deactivatePack` 方法（软删除）：

```typescript
await packStorage.deactivatePack('pack.no.svalbard.longyearbyen');
```

### Q: 如何查询所有 Pack？

A: 使用 `loadAllPacks` 方法：

```typescript
const packs = await packStorage.loadAllPacks();
```

### Q: 如何按国家查找 Pack？

A: 使用 `findPacksByCountry` 方法：

```typescript
const packs = await packStorage.findPacksByCountry('NO');
```

## 下一步

- 查看 [README.md](./README.md) 了解完整系统架构
- 参考 [svalbard-pack.example.ts](./data/svalbard-pack.example.ts) 查看完整示例
- 查看 [readiness-pack.types.ts](./types/readiness-pack.types.ts) 了解类型定义

