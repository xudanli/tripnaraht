# 路线模板迁移 - 快速开始

## 🎯 目标

将路线模板从旧格式（只有 `requiredNodes` ID数组）迁移到新格式（包含完整POI信息的 `pois` 数组），以便前端可以显示POI名称和顺序。

## 📋 快速检查

### 方法1: 使用测试脚本（推荐）

```bash
# 检查模板36的迁移状态
./scripts/test-template-migration.sh 36
```

### 方法2: 使用API端点

```bash
# 检查迁移状态
curl http://localhost:3000/api/route-directions/templates/36/migration-status

# 查看模板详情
curl http://localhost:3000/api/route-directions/templates/36
```

## 🚀 执行迁移

### 步骤1: 预览迁移（dry-run）

```bash
# 预览单个模板的迁移
npx ts-node scripts/migrate-route-template-to-pois.ts 36 --dry-run

# 预览所有模板的迁移
npx ts-node scripts/migrate-route-template-to-pois.ts --dry-run
```

### 步骤2: 执行迁移

```bash
# 迁移单个模板
npx ts-node scripts/migrate-route-template-to-pois.ts 36

# 迁移所有模板
npx ts-node scripts/migrate-route-template-to-pois.ts
```

## ✅ 验证结果

迁移完成后，验证POI信息是否正确显示：

```bash
# 查看迁移后的模板数据（应该包含pois数组）
curl http://localhost:3000/api/route-directions/templates/36 | python3 -m json.tool
```

检查响应中的 `dayPlans[].pois` 数组，应该包含：
- ✅ `nameCN` - POI中文名称
- ✅ `nameEN` - POI英文名称  
- ✅ `order` - POI顺序
- ✅ `category` - POI类别
- ✅ `required` - 是否必游
- ✅ 其他详细信息（评分、地址等）

## 📊 迁移状态说明

### 旧格式（需要迁移）
```json
{
  "dayPlans": [{
    "day": 1,
    "requiredNodes": ["381042", "381108"],
    "pois": []  // 空数组
  }]
}
```

### 新格式（已迁移）
```json
{
  "dayPlans": [{
    "day": 1,
    "requiredNodes": ["381042", "381108"],  // 保留以向后兼容
    "pois": [
      {
        "id": 381042,
        "nameCN": "POI名称",
        "order": 1,
        "required": true
      }
    ]
  }]
}
```

## 🔍 常见问题

### Q: 迁移后前端还是看不到POI名称？
A: 确保前端调用的是 `GET /api/route-directions/templates/:id` 接口，并检查响应中的 `pois` 数组。

### Q: 有些POI ID在数据库中不存在？
A: 迁移脚本会记录这些缺失的POI ID，但不会中断迁移。你需要：
1. 检查这些ID是否正确
2. 确认对应的Place数据是否已导入
3. 如果ID错误，需要手动更新模板

### Q: 迁移后还能回退吗？
A: 迁移脚本保留了原始的 `requiredNodes` 字段，所以理论上可以回退。但建议迁移前备份数据库。

## 📚 相关文档

- [完整迁移指南](./MIGRATE_ROUTE_TEMPLATE.md)
- [路线模板API文档](../src/route-directions/ROUTE_TEMPLATE_API.md)
