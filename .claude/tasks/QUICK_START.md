# 行程名称字段功能 - 快速开始指南

## 🎯 功能概述

为行程（Trip）添加可自定义的名称字段，提升用户体验和行程管理效率。

**状态**：✅ 后端开发完成，待数据库迁移和前端开发

---

## 📋 文档清单

1. **PRD 文档**：`.claude/tasks/trip-name-field-prd.md` - 完整产品需求文档
2. **影响范围评估**：`.claude/tasks/trip-name-field-impact-assessment.md` - 技术影响分析
3. **实施总结**：`.claude/tasks/trip-name-field-implementation-summary.md` - 后端实施总结
4. **完成检查清单**：`.claude/tasks/trip-name-field-completion-checklist.md` - 验收清单
5. **前端修改说明书**：`.claude/tasks/trip-name-field-frontend-guide.md` - ⭐ 前端开发指南
6. **数据库迁移指南**：`.claude/tasks/trip-name-field-migration-guide.md` - ⭐ 数据库迁移指南

---

## 🚀 快速开始

### 第一步：数据库迁移（后端/DBA）

**参考文档**：`.claude/tasks/trip-name-field-migration-guide.md`

**快速命令**：
```bash
# 1. 备份数据库（必须！）
pg_dump -h localhost -U your_user -d your_database > backup_$(date +%Y%m%d).sql

# 2. 执行迁移（开发环境）
npx prisma migrate dev --name add_trip_name_field

# 3. 验证迁移结果
psql -h localhost -U your_user -d your_database -c "SELECT COUNT(*) FROM \"Trip\" WHERE \"name\" IS NULL;"
# 应该返回 0（所有行程都有名称）
```

**迁移脚本位置**：`prisma/migrations/20260204100007_add_trip_name_field/migration.sql`

---

### 第二步：前端开发

**参考文档**：`.claude/tasks/trip-name-field-frontend-guide.md`

**需要修改的页面**：
1. ✅ **创建行程页面** - 添加名称输入框
2. ✅ **编辑行程页面** - 添加名称编辑框
3. ✅ **行程列表页面** - 显示行程名称
4. ✅ **行程详情页面** - 显示行程名称（页面标题）

**关键代码示例**：
```tsx
// 创建行程时包含 name 字段（可选）
const payload = {
  destination: 'IS',
  startDate: '2025-06-01',
  endDate: '2025-06-10',
  totalBudget: 50000,
  travelers: [...],
  name: '冰岛环岛游', // 🆕 可选字段
};

// 显示行程名称（处理空值）
const displayName = trip.name || `${getDestinationName(trip.destination)} ${formatDate(trip.startDate)}`;
```

---

### 第三步：测试验证

**参考文档**：`.claude/tasks/trip-name-field-completion-checklist.md`

**测试要点**：
- [ ] 创建行程时可以填写名称
- [ ] 创建行程时可以不填写名称（自动生成默认名称）
- [ ] 更新行程时可以修改名称
- [ ] 行程列表和详情页面正确显示名称
- [ ] 名称长度限制：1-200 字符

---

## 📊 API 变更说明

### 创建行程
```http
POST /api/trips
Content-Type: application/json

{
  "destination": "IS",
  "startDate": "2025-06-01",
  "endDate": "2025-06-10",
  "totalBudget": 50000,
  "travelers": [...],
  "name": "冰岛环岛游"  // 🆕 新增：可选字段
}
```

### 更新行程
```http
PUT /api/trips/:id
Content-Type: application/json

{
  "name": "冰岛环岛游（修改版）"  // 🆕 新增：可选字段
}
```

### 获取行程
```http
GET /api/trips/:id

Response:
{
  "success": true,
  "data": {
    "id": "...",
    "name": "冰岛环岛游",  // 🆕 新增字段
    "destination": "IS",
    ...
  }
}
```

---

## ✅ 验收标准

### 功能验收
- ✅ 创建行程时可以填写名称
- ✅ 创建行程时可以不填写名称（自动生成默认名称）
- ✅ 更新行程时可以修改名称
- ✅ 获取行程时返回名称字段
- ✅ 名称长度限制：1-200 字符
- ✅ 已有行程自动生成默认名称（数据迁移后）

### 性能验收
- ✅ API 响应时间增加 < 50ms
- ✅ 数据迁移时间 < 5 分钟（10万条数据）

### 兼容性验收
- ✅ 现有 API 调用不受影响（向后兼容）
- ✅ 前端可以正常显示名称字段

---

## 🎯 开发优先级

### P0（必须）
1. ✅ 数据库迁移
2. ✅ 创建行程页面：添加名称输入框
3. ✅ 行程列表页面：显示名称
4. ✅ 行程详情页面：显示名称

### P1（重要）
1. ⏸️ 编辑行程页面：支持修改名称
2. ⏸️ 详情页面：内联编辑名称

### P2（可选）
1. ⏸️ 名称搜索功能
2. ⏸️ 名称智能建议

---

## 📞 联系方式

如有问题，请参考：
- **PRD 文档**：`.claude/tasks/trip-name-field-prd.md`
- **技术文档**：`.claude/tasks/trip-name-field-implementation-summary.md`
- **前端指南**：`.claude/tasks/trip-name-field-frontend-guide.md`
- **迁移指南**：`.claude/tasks/trip-name-field-migration-guide.md`

---

**文档版本**：v1.0  
**创建日期**：2025-02-04  
**状态**：✅ 后端完成，待迁移和前端开发
