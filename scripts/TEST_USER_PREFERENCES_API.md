# 用户偏好接口测试指南

本文档说明如何测试用户偏好相关的 API 接口。

## 快速开始

### 前置条件

1. **确保服务器正在运行**
   ```bash
   # 检查服务器是否运行
   curl http://localhost:3000/api/health || echo "服务器未运行"
   ```

2. **（可选）获取认证 Token**
   
   如果需要测试需要认证的接口，需要先获取 JWT token：
   
   **方法1: 通过邮箱登录**
   ```bash
   # 1. 发送验证码
   curl -X POST "http://localhost:3000/api/auth/email/send-code" \
     -H "Content-Type: application/json" \
     -d '{"email": "your@email.com"}'
   
   # 2. 使用验证码登录
   curl -X POST "http://localhost:3000/api/auth/email/login" \
     -H "Content-Type: application/json" \
     -d '{
       "email": "your@email.com",
       "code": "verification_code"
     }'
   ```
   
   响应中会包含 `accessToken`，复制它用于测试。
   
   **方法2: 通过 Google OAuth**
   ```bash
   curl -X POST "http://localhost:3000/api/auth/google/id-token" \
     -H "Content-Type: application/json" \
     -d '{"idToken": "google_id_token"}'
   ```

### 运行测试

#### 方法1: 使用 TypeScript 测试脚本（推荐）

```bash
# 基本用法（不需要认证的接口）
npx tsx scripts/test-user-preferences-api.ts

# 指定 API 基础 URL
npx tsx scripts/test-user-preferences-api.ts http://localhost:3000

# 指定用户 ID
npx tsx scripts/test-user-preferences-api.ts http://localhost:3000 test-user-123

# 指定 Token（用于需要认证的接口）
npx tsx scripts/test-user-preferences-api.ts http://localhost:3000 test-user-123 your_jwt_token

# 使用环境变量
export API_BASE_URL=http://localhost:3000
export TEST_USER_ID=test-user-123
export TEST_TOKEN=your_jwt_token
npx tsx scripts/test-user-preferences-api.ts
```

#### 方法2: 使用 Shell 脚本

```bash
# 基本用法
./scripts/test-user-preferences-api.sh

# 指定参数
./scripts/test-user-preferences-api.sh http://localhost:3000 test-user-123 your_jwt_token

# 使用环境变量
export API_BASE_URL=http://localhost:3000
export TEST_USER_ID=test-user-123
export TEST_TOKEN=your_jwt_token
./scripts/test-user-preferences-api.sh
```

#### 方法3: 使用 curl 手动测试

##### 1. 获取用户偏好画像（需要认证）

```bash
curl -X GET "http://localhost:3000/api/users/profile" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

##### 2. 更新用户偏好画像（需要认证）

```bash
curl -X PUT "http://localhost:3000/api/users/profile" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "preferences": {
      "preferredAttractionTypes": ["ATTRACTION", "NATURE"],
      "dietaryRestrictions": ["VEGETARIAN"],
      "travelPreferences": {
        "pace": "MODERATE",
        "budget": "MEDIUM"
      },
      "tags": ["solo", "adventure"]
    }
  }'
```

##### 3. 获取用户偏好摘要（规划助手，无需认证）

```bash
curl -X GET "http://localhost:3000/api/agent/planning-assistant/users/USER_ID/preferences" \
  -H "Content-Type: application/json"
```

##### 4. 清除用户偏好（规划助手，无需认证）

```bash
curl -X POST "http://localhost:3000/api/agent/planning-assistant/users/USER_ID/preferences/clear" \
  -H "Content-Type: application/json"
```

##### 5. 推断用户偏好（决策风格，需要认证）

```bash
curl -X GET "http://localhost:3000/api/v1/decision-replay/style/USER_ID/preferences" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

## 测试场景

### 场景1: 完整的用户偏好设置流程

1. **获取当前偏好**（可能为空）
   ```bash
   GET /api/users/profile
   ```

2. **设置完整偏好**
   ```bash
   PUT /api/users/profile
   {
     "preferences": {
       "preferredAttractionTypes": ["NATURE", "CULTURE"],
       "travelPreferences": {
         "pace": "MODERATE",
         "budget": "MEDIUM"
       }
     }
   }
   ```

3. **验证偏好已更新**
   ```bash
   GET /api/users/profile
   ```

### 场景2: 部分更新偏好

只更新部分字段，其他字段保持不变：

```bash
PUT /api/users/profile
{
  "preferences": {
    "travelPreferences": {
      "pace": "FAST"
    }
  }
}
```

### 场景3: 学习到的偏好 vs 手动设置的偏好

1. **查看手动设置的偏好**
   ```bash
   GET /api/users/profile
   ```

2. **查看系统学习到的偏好**
   ```bash
   GET /api/agent/planning-assistant/users/USER_ID/preferences
   ```

3. **清除学习到的偏好**
   ```bash
   POST /api/agent/planning-assistant/users/USER_ID/preferences/clear
   ```

## 测试覆盖的接口

| 接口 | 方法 | 认证 | 测试脚本 |
|------|------|------|----------|
| `/api/users/profile` | GET | ✅ | ✅ |
| `/api/users/profile` | PUT | ✅ | ✅ |
| `/api/agent/planning-assistant/users/:userId/preferences` | GET | ❌ | ✅ |
| `/api/agent/planning-assistant/users/:userId/preferences/clear` | POST | ❌ | ✅ |
| `/api/v1/decision-replay/style/:userId/preferences` | GET | ✅ | ✅ |

## 常见问题

### Q1: 连接失败（ECONNREFUSED）

**原因**: 服务器未运行或地址不正确

**解决方案**:
1. 确认服务器正在运行：
   ```bash
   # 检查服务器状态
   curl http://localhost:3000/api/health
   ```

2. 如果服务器运行在不同的端口，更新 `API_BASE_URL`：
   ```bash
   export API_BASE_URL=http://localhost:3001
   ```

### Q2: 401 Unauthorized 错误

**原因**: 接口需要认证，但未提供有效的 token

**解决方案**:
1. 获取有效的 token（参考前置条件部分）
2. 设置环境变量或作为参数传入：
   ```bash
   export TEST_TOKEN=your_jwt_token
   # 或
   npx tsx scripts/test-user-preferences-api.ts http://localhost:3000 test-user-123 your_jwt_token
   ```

### Q3: 404 Not Found 错误

**可能原因**:
- 用户ID不存在（对于决策风格偏好接口）
- 用户没有足够的历史数据（对于推断偏好接口）

**解决方案**:
- 使用存在的用户ID
- 对于学习到的偏好接口，如果用户没有历史数据，会返回空摘要（这是正常的）

### Q4: 测试脚本执行失败

**可能原因**:
- 缺少依赖（tsx）
- 脚本权限问题

**解决方案**:
```bash
# 安装依赖
npm install

# 添加执行权限（Shell脚本）
chmod +x scripts/test-user-preferences-api.sh

# 使用 npx 运行 TypeScript 脚本
npx tsx scripts/test-user-preferences-api.ts
```

## 预期结果

### 成功的测试输出示例

```
🚀 开始测试用户偏好接口...

API Base URL: http://localhost:3000
Test User ID: test-user-123
Token: 已设置
============================================================

📋 测试: 获取用户偏好画像
   方法: GET /api/users/profile
   ✅ 成功: HTTP 200 (45ms)
   响应: {
     "success": true,
     "data": {
       "userId": "...",
       "preferences": {...}
     }
   }

...

============================================================
📊 测试总结
============================================================

总计: 9 个测试
✅ 成功: 9
❌ 失败: 0
⏱️  总耗时: 234ms
```

## 调试技巧

1. **查看详细响应**
   - 测试脚本会输出完整的请求和响应信息
   - 使用 `jq` 格式化 JSON 输出（Shell脚本）

2. **检查服务器日志**
   - 查看服务器控制台的错误日志
   - 检查数据库连接和查询

3. **使用 Postman 或类似工具**
   - 导入接口文档
   - 手动测试单个接口
   - 查看请求/响应详情

4. **验证数据持久化**
   - 更新偏好后，重新获取验证数据是否保存
   - 检查数据库中的实际数据

## 相关文档

- [用户偏好接口文档](../USER_PREFERENCES_API_DOCUMENTATION.md)
- [用户 API 文档](.claude/roles/rl-infra/USER_API_DOCUMENTATION.md)
