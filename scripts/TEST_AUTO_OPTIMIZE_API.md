# Auto综合 API 测试指南

**接口**: `POST /api/planning-workbench/auto-optimize`  
**文档**: `src/trips/AUTO_OPTIMIZE_API_DOCUMENTATION.md`

---

## 📋 前置条件

1. **启动服务器**
   ```bash
   npm run start:dev
   # 或
   npm run start
   ```

2. **确认服务器运行在** `http://localhost:3000`

3. **准备一个有效的 Trip ID**
   - 可以通过 `GET /api/trips` 获取现有行程
   - 或创建一个新行程

---

## 🧪 测试方法

### 方法1: 使用测试脚本（推荐）

**TypeScript 版本**:
```bash
# 设置环境变量（可选）
export API_BASE_URL=http://localhost:3000
export TRIP_ID=your-trip-id-here

# 运行测试
npx ts-node scripts/test-auto-optimize-api.ts
```

**Shell 版本**:
```bash
# 设置环境变量（可选）
export API_BASE_URL=http://localhost:3000
export TRIP_ID=your-trip-id-here

# 运行测试
bash scripts/test-auto-optimize-api.sh
```

### 方法2: 使用 curl（手动测试）

**预览模式**（推荐，不实际修改数据）:
```bash
curl -X POST "http://localhost:3000/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "your-trip-id-here",
    "preview": true,
    "limit": 10
  }'
```

**实际应用模式**（会修改行程数据）:
```bash
curl -X POST "http://localhost:3000/api/planning-workbench/auto-optimize" \
  -H "Content-Type: application/json" \
  -d '{
    "tripId": "your-trip-id-here",
    "preview": false,
    "limit": 10
  }'
```

### 方法3: 使用 Postman 或类似工具

1. **请求方法**: `POST`
2. **URL**: `http://localhost:3000/api/planning-workbench/auto-optimize`
3. **Headers**:
   ```
   Content-Type: application/json
   ```
4. **Body** (JSON):
   ```json
   {
     "tripId": "your-trip-id-here",
     "preview": true,
     "limit": 10
   }
   ```

---

## ✅ 预期响应

### 成功响应（200 OK）

```json
{
  "success": true,
  "data": {
    "success": true,
    "appliedCount": 3,
    "suggestions": [
      {
        "id": "suggestion-1",
        "title": "Day 2 时间安排较紧凑",
        "severity": "blocker",
        "applied": true
      }
    ],
    "impact": {
      "metrics": {
        "fatigue": -15,
        "buffer": 90,
        "cost": 150
      }
    }
  }
}
```

### 验证要点

1. ✅ **HTTP 状态码**: 200
2. ✅ **success 字段**: true
3. ✅ **只包含高优先级建议**: 所有 `severity` 都是 `blocker`
4. ✅ **应用结果**: `appliedCount` 显示成功应用的数量
5. ✅ **影响分析**: `impact.metrics` 显示优化效果

---

## 🔍 测试场景

### 场景1: 预览模式测试

**目的**: 查看将要应用的建议，不实际修改行程

**请求**:
```json
{
  "tripId": "xxx",
  "preview": true,
  "limit": 10
}
```

**验证**:
- ✅ 返回建议列表
- ✅ 不实际修改行程数据
- ✅ 只包含高优先级建议（BLOCKER）

### 场景2: 限制数量测试

**目的**: 测试 limit 参数是否生效

**请求**:
```json
{
  "tripId": "xxx",
  "preview": true,
  "limit": 5
}
```

**验证**:
- ✅ 返回的建议数量 ≤ 5
- ✅ 只包含高优先级建议

### 场景3: 实际应用测试

**目的**: 测试实际应用功能（谨慎使用）

**请求**:
```json
{
  "tripId": "xxx",
  "preview": false,
  "limit": 10
}
```

**验证**:
- ✅ 建议被实际应用
- ✅ 行程数据被修改
- ✅ 返回应用结果和影响分析

---

## ⚠️ 注意事项

1. **预览模式优先**: 建议先使用 `preview: true` 测试，避免误修改数据
2. **Trip ID 有效性**: 确保使用的 Trip ID 存在且有高优先级建议
3. **服务器状态**: 确保服务器已启动且接口已注册
4. **数据备份**: 实际应用前建议备份行程数据

---

## 🐛 常见问题

### 问题1: 404 Not Found

**原因**: 
- 服务器未启动
- 路由未正确注册
- 需要重启服务器加载新代码

**解决**:
```bash
# 重启服务器
npm run start:dev
```

### 问题2: 500 Internal Server Error

**原因**: 
- TripSuggestionsService 未注入
- 数据库连接问题
- 业务逻辑错误

**解决**: 查看服务器日志，检查错误信息

### 问题3: 返回空建议列表

**原因**: 
- 行程没有高优先级建议（BLOCKER）
- 所有建议已被应用或忽略

**解决**: 检查行程是否有未处理的高优先级建议

---

## 📚 相关文档

- [Auto综合 API 文档](../src/trips/AUTO_OPTIMIZE_API_DOCUMENTATION.md)
- [行程详情页 API 文档](../src/trips/TRIP_DETAIL_API_DOCUMENTATION.md)
- [关键决策文档](../.claude/product-decisions/trip-detail-page-key-decisions.md)

---

**文档状态**: ✅ 已完成  
**最后更新**: 2026-02-05
