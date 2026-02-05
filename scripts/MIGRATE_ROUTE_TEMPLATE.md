# 路线模板迁移指南

## 概述

此脚本用于将路线模板从旧格式（`requiredNodes` ID数组）迁移到新格式（包含完整POI信息的 `pois` 数组）。

## 旧格式 vs 新格式

### 旧格式（已废弃）
```json
{
  "dayPlans": [
    {
      "day": 1,
      "theme": "南岸 → Landmannalaugar",
      "requiredNodes": ["381042", "381108", "381117"]
    }
  ]
}
```

### 新格式（推荐）
```json
{
  "dayPlans": [
    {
      "day": 1,
      "theme": "南岸 → Landmannalaugar",
      "requiredNodes": ["381042", "381108", "381117"],  // 保留以向后兼容
      "pois": [
        {
          "id": 381042,
          "uuid": "...",
          "nameCN": "POI中文名称",
          "nameEN": "POI English Name",
          "category": "ATTRACTION",
          "required": true,
          "priority": "MUST_SEE",
          "order": 1,
          "rating": 4.5,
          "address": "..."
        }
      ]
    }
  ]
}
```

## 使用方法

### 1. 检查需要迁移的模板

首先，查看哪些模板需要迁移：

```bash
# 查看模板详情（会显示是否使用旧格式）
curl http://localhost:3000/api/route-directions/templates/36
```

如果响应中 `dayPlans[].pois` 为空数组，且 `dayPlans[].requiredNodes` 有值，说明需要迁移。

### 2. 执行迁移

#### 迁移单个模板（推荐先测试）

```bash
#  dry-run 模式：只查看会做什么，不实际修改
npx ts-node scripts/migrate-route-template-to-pois.ts 36 --dry-run

# 实际执行迁移
npx ts-node scripts/migrate-route-template-to-pois.ts 36
```

#### 迁移所有模板

```bash
# dry-run 模式
npx ts-node scripts/migrate-route-template-to-pois.ts --dry-run

# 实际执行
npx ts-node scripts/migrate-route-template-to-pois.ts
```

## 迁移过程

1. **识别旧格式模板**：检查 `dayPlans` 中是否有 `requiredNodes` 但没有 `pois`
2. **查询POI信息**：根据 `requiredNodes` 中的ID从 `Place` 表查询完整信息
3. **创建POI数组**：将查询到的Place信息转换为 `pois` 数组格式
4. **保留顺序**：按照 `requiredNodes` 的顺序设置 `order` 字段
5. **更新数据库**：保存更新后的模板数据

## 迁移后的效果

迁移后，`GET /api/route-directions/templates/:id` 接口会返回：

- ✅ POI的完整信息（名称、类别、评分等）
- ✅ POI的顺序（`order` 字段）
- ✅ POI的必游标记（`required: true`）
- ✅ 保留原始的 `requiredNodes`（向后兼容）

## 注意事项

1. **备份数据**：迁移前建议备份数据库
2. **测试环境**：先在测试环境执行，确认无误后再在生产环境执行
3. **缺失的POI**：如果 `requiredNodes` 中的ID在数据库中不存在，会记录错误但不会中断迁移
4. **向后兼容**：迁移后仍保留 `requiredNodes` 字段，确保旧代码仍能工作

## 错误处理

如果迁移过程中出现错误：

1. **POI不存在**：脚本会记录错误但继续处理其他POI
2. **无效的ID格式**：字符串ID会尝试转换为数字，无效的会被跳过
3. **数据库错误**：会记录详细错误信息

## 验证迁移结果

迁移完成后，验证结果：

```bash
# 查看迁移后的模板数据
curl http://localhost:3000/api/route-directions/templates/36 | jq '.data.dayPlans[].pois'
```

应该能看到包含完整POI信息的数组。

## API 接口

迁移后，以下接口会返回POI名称和顺序：

- `GET /api/route-directions/templates/:id` - 获取模板详情（包含POI信息）
- `GET /api/route-directions/templates/:id/available-pois` - 获取可用POI列表

## 相关文档

- [路线模板API文档](../src/route-directions/ROUTE_TEMPLATE_API.md)
- [路线模板CRUD API](../src/route-directions/ROUTE_CRUD_API.md)
