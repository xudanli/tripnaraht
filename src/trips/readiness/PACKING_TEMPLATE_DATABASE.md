# 打包清单模板数据库存储

## 概述

打包清单模板数据（`packing-checklist-template.json` 和 `packing-guide.json`）现已存储到数据库中，便于版本管理、更新和查询。

## 数据库表结构

### 1. `packing_checklist_templates` 表

存储 `packing-checklist-template.json` 的完整数据。

**字段**:
- `id` (UUID) - 主键
- `version` (VARCHAR) - 版本号（如 "1.0.0"）
- `last_updated` (TIMESTAMP) - 最后更新时间
- `template_data` (JSONB) - 完整的模板数据（JSON）
- `is_active` (BOOLEAN) - 是否激活
- `created_at` (TIMESTAMP) - 创建时间
- `updated_at` (TIMESTAMP) - 更新时间

**索引**:
- `version` - 版本索引
- `is_active` - 激活状态索引

### 2. `packing_guides` 表

存储 `packing-guide.json` 的完整数据。

**字段**:
- `id` (UUID) - 主键
- `version` (VARCHAR) - 版本号（如 "1.0.0"）
- `last_updated` (TIMESTAMP) - 最后更新时间
- `guide_data` (JSONB) - 完整的指南数据（JSON）
- `is_active` (BOOLEAN) - 是否激活
- `created_at` (TIMESTAMP) - 创建时间
- `updated_at` (TIMESTAMP) - 更新时间

**索引**:
- `version` - 版本索引
- `is_active` - 激活状态索引

## Prisma Schema

```prisma
// 打包清单模板表
model PackingChecklistTemplate {
  id          String   @id @default(uuid()) @db.Uuid
  version     String   @db.VarChar(50)
  lastUpdated DateTime @map("last_updated")
  templateData Json    @map("template_data")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([version])
  @@index([isActive])
  @@map("packing_checklist_templates")
}

// 打包指南表
model PackingGuide {
  id          String   @id @default(uuid()) @db.Uuid
  version     String   @db.VarChar(50)
  lastUpdated DateTime @map("last_updated")
  guideData   Json     @map("guide_data")
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([version])
  @@index([isActive])
  @@map("packing_guides")
}
```

## 导入脚本

**文件**: `scripts/import-packing-templates.ts`

**功能**:
- 从 `data/packing-checklist-template.json` 读取数据
- 从 `data/packing-guide.json` 读取数据
- 导入到数据库（如果版本已存在则更新）

**使用方法**:
```bash
npx ts-node scripts/import-packing-templates.ts
```

## 当前数据状态

✅ **已导入的数据**:
- `packing-checklist-template.json` (版本 1.0.0) - 12.16 KB
- `packing-guide.json` (版本 1.0.0) - 17.80 KB

## 数据内容

### packing-checklist-template.json 包含：

1. **快速清单** (quick_checklist_summer/transition/winter)
   - 夏季清单：~40-45个物品
   - 过渡季清单：~55-65个物品
   - 冬季清单：~80-90个物品

2. **用户类型模板** (template_by_user_type)
   - first_timer_summer_3days
   - photographer_winter_8days
   - family_with_kids_summer_3days
   - budget_backpacker_summer_7days

3. **季节性数量指南** (seasonal_quantity_guide)
   - 按季节和天数估算衣物数量

4. **打包顺序步骤** (packing_order_steps)
   - 9个步骤的详细打包指导

5. **出发前检查清单** (pre_departure_final_checklist)
   - 1天前检查项
   - 3小时前检查项
   - 30分钟前检查项
   - 绝对必须物品

### packing-guide.json 包含：

1. **分层穿衣系统** (layering_system)
2. **鞋类指南** (footwear)
3. **配件指南** (accessories)
4. **裤子指南** (pants)
5. **背包指南** (bags)
6. **电子设备保护** (electronics_protection)
7. **摄影装备** (photography_gear)
8. **游泳装备** (swimming_gear)
9. **打包技巧** (packing_tips)
10. **不要带的东西** (what_not_to_bring)
11. **预算选项** (budget_options)
12. **专业建议** (pro_tips)

## 使用方式

### 当前实现（从文件读取）

`PackingTemplateService` 目前从文件系统读取数据：

```typescript
const templatePath = join(process.cwd(), 'data', 'packing-checklist-template.json');
const templateContent = readFileSync(templatePath, 'utf-8');
this.templateData = JSON.parse(templateContent);
```

### 未来改进（从数据库读取）

可以修改 `PackingTemplateService` 从数据库读取：

```typescript
async loadTemplateDataFromDatabase() {
  const template = await this.prisma.packingChecklistTemplate.findFirst({
    where: { isActive: true },
    orderBy: { lastUpdated: 'desc' },
  });
  
  if (template) {
    this.templateData = template.templateData as PackingChecklistTemplate;
  }
}
```

**优势**:
- 支持版本管理
- 支持动态更新（无需重启服务）
- 支持多版本并存
- 便于管理和查询

## 管理接口（建议）

可以添加管理接口来管理模板数据：

```typescript
// GET /api/readiness/admin/packing-templates
// 获取所有模板版本

// GET /api/readiness/admin/packing-templates/:version
// 获取指定版本的模板

// POST /api/readiness/admin/packing-templates
// 创建新版本的模板

// PUT /api/readiness/admin/packing-templates/:id
// 更新模板

// DELETE /api/readiness/admin/packing-templates/:id
// 删除模板（软删除）
```

## 相关文件

- **数据库 Schema**: `prisma/schema.prisma`
- **导入脚本**: `scripts/import-packing-templates.ts`
- **表创建 SQL**: `scripts/create-packing-template-tables.sql`
- **服务实现**: `src/trips/readiness/services/packing-template.service.ts`
- **类型定义**: `src/trips/readiness/types/packing-template.types.ts`
- **数据文件**: 
  - `data/packing-checklist-template.json`
  - `data/packing-guide.json`
