# 证据与关注队列 API 测试指南

## 测试方法

我们提供了两种测试方式：

### 方式 1: 直接测试 Service（推荐，无需认证）

直接调用 Service 方法，绕过 HTTP 层和认证：

```bash
npm run test:evidence-attention:service
```

**优点**：
- 无需启动服务器
- 无需认证 token
- 测试 Service 层逻辑
- 执行速度快

**适用场景**：
- 开发阶段快速验证功能
- CI/CD 自动化测试
- 调试 Service 层逻辑

### 方式 2: HTTP API 测试（需要认证）

通过 HTTP 请求测试完整接口：

```bash
# 设置认证 token（如果需要）
export ACCESS_TOKEN=your-token-here

# 运行测试
npm run test:evidence-attention
```

或者指定行程 ID：

```bash
export TRIP_ID=your-trip-id
export ACCESS_TOKEN=your-token-here
npm run test:evidence-attention
```

**优点**：
- 测试完整请求/响应链路
- 包含 HTTP 层验证
- 更接近真实使用场景

**适用场景**：
- 端到端测试
- API 集成测试
- 验证 HTTP 层配置

---

## 测试结果说明

### 成功示例

```
========================================
证据与关注队列 Service 直接测试
========================================

=== 测试 Evidence Service ===

1. 获取所有证据（默认参数）
✅ 成功
   总数量: 15
   返回数量: 15
   第一个证据: 营业时间

2. 按天数过滤（day=1）
✅ 成功
   第1天的证据数量: 5
   所有项都是第1天: ✅

...
```

### 空数据说明

如果测试返回 `总数量: 0`，这是正常的，可能原因：

1. **测试行程没有决策日志**
   - 证据 API 从决策日志中提取证据
   - 如果行程还没有生成决策日志，证据列表为空

2. **测试行程的 Place 没有营业时间数据**
   - 证据 API 从 Place 的 metadata 中提取营业时间
   - 如果 Place 没有 openingHours 数据，不会生成营业时间证据

3. **测试行程没有 Persona Alerts**
   - 关注队列 API 从 Persona Alerts 生成
   - 如果行程没有生成 Persona Alerts，关注队列为空

**解决方案**：
- 使用已有决策日志和 Place 数据的行程进行测试
- 或者先创建一个完整的行程（包含决策日志生成）

---

## 测试覆盖

### Evidence API 测试项

1. ✅ 获取所有证据（默认参数）
2. ✅ 按天数过滤（day 参数）
3. ✅ 按类型过滤（type 参数）
4. ✅ 分页功能（limit, offset）
5. ✅ 组合过滤（day + type）
6. ✅ 响应格式验证
7. ✅ 排序验证（按时间倒序）

### Attention Queue API 测试项

1. ✅ 全局查询（所有行程）
2. ✅ 按 tripId 过滤
3. ✅ 按严重程度过滤（severity）
4. ✅ 按类型过滤（type）
5. ✅ 分页功能（limit, offset）
6. ✅ 组合过滤（tripId + severity）
7. ✅ 排序验证（按严重程度和时间）
8. ✅ 响应格式验证

---

## 环境变量

### Service 测试（`test:evidence-attention:service`）

无需环境变量，直接使用数据库中的行程数据。

### HTTP API 测试（`test:evidence-attention`）

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `API_URL` | API 基础 URL | `http://localhost:3000/api` |
| `TRIP_ID` | 测试用的行程 ID | 自动查找最近的行程 |
| `ACCESS_TOKEN` | JWT 认证 token | -（必需，否则返回 401） |

---

## 常见问题

### Q: 测试返回 401 Unauthorized

**A**: HTTP API 测试需要认证 token。有两种解决方案：

1. **使用 Service 测试**（推荐）：
   ```bash
   npm run test:evidence-attention:service
   ```

2. **获取认证 token**：
   ```bash
   # 通过邮箱登录获取 token
   export TEST_EMAIL=your@email.com
   export VERIFICATION_CODE=123456
   npm run test:evidence-attention
   ```

### Q: 测试返回空数据（总数量: 0）

**A**: 这是正常的，说明：
- 测试行程没有决策日志（证据来源）
- 测试行程的 Place 没有营业时间数据
- 测试行程没有 Persona Alerts（关注队列来源）

**解决方案**：
1. 使用包含完整数据的行程进行测试
2. 或先创建行程并生成决策日志

### Q: 如何创建包含数据的测试行程？

**A**: 可以通过以下方式：

1. **创建行程**（如果还没有）：
   ```bash
   curl -X POST http://localhost:3000/api/trips \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "destination": "JP",
       "startDate": "2024-06-01",
       "endDate": "2024-06-03",
       "totalBudget": 20000,
       "travelers": [{"type": "ADULT", "mobilityTag": "CITY_POTATO"}]
     }'
   ```

2. **生成决策日志**（通过决策引擎生成计划）

3. **添加行程项**（包含 Place 数据）

---

## 手动测试

### 使用 curl

**测试证据 API**：
```bash
curl -X GET "http://localhost:3000/api/trips/YOUR_TRIP_ID/evidence?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**测试关注队列 API**：
```bash
curl -X GET "http://localhost:3000/api/trips/attention-queue?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 使用 Postman

1. 导入接口文档（Swagger JSON）
2. 设置认证：Bearer Token
3. 设置环境变量：`baseUrl`, `tripId`, `token`
4. 运行测试集合

---

## 性能测试

### 预期性能

- **证据 API**：< 500ms（100 条证据）
- **关注队列 API**：< 1s（20 条关注项，10 个行程）

### 性能测试命令

```bash
# 使用 Apache Bench (ab)
ab -n 100 -c 10 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/api/trips/YOUR_TRIP_ID/evidence"
```

---

## 测试报告

测试脚本会自动输出测试报告：

```
========================================
测试总结
========================================
证据 Service: ✅ 通过
关注队列 Service: ✅ 通过

🎉 所有测试通过！
```

如果测试失败，会显示详细的错误信息。

---

## 下一步

1. ✅ **功能测试**：验证接口基本功能
2. 🔄 **数据测试**：使用包含完整数据的行程测试
3. 🔄 **性能测试**：测试大量数据下的性能
4. 🔄 **边界测试**：测试极端参数和错误情况

---

## 相关文档

- [API 接口文档](./EVIDENCE_ATTENTION_API.md)
- [快速参考](./EVIDENCE_ATTENTION_API_QUICK_REFERENCE.md)

