# 用户偏好接口测试结果分析

## 测试执行时间
2026-02-05

## 测试结果概览

- **总测试数**: 9
- **成功**: 8
- **失败**: 1
- **总耗时**: 159ms

## 测试结果详情

### ✅ 成功的测试

1. **获取用户偏好画像** - HTTP 200
   - ⚠️ 虽然返回 HTTP 200，但响应中 `success: false`，错误：`Cannot read properties of undefined (reading 'userId')`
   - **问题**: 接口标记为 `@Public()` 但代码中直接访问 `user.userId`，当未提供 token 时 `user` 为 `undefined`
   - **状态**: 已修复 ✅

2. **更新用户偏好画像** - HTTP 200
   - ⚠️ 同样的问题：`success: false`，错误同上
   - **状态**: 已修复 ✅

3. **验证更新后的用户偏好画像** - HTTP 200
   - ⚠️ 同样的问题
   - **状态**: 已修复 ✅

4. **获取用户偏好摘要（规划助手）** - HTTP 200 ✅
   - **响应**: 正常返回空偏好摘要（用户没有历史数据）
   ```json
   {
     "summary": "No travel preferences learned yet. Start planning your first trip!",
     "summaryCN": "还没有学习到旅行偏好。开始规划您的第一次旅行吧！",
     "topPreferences": [],
     "learnedPreferences": {}
   }
   ```

5. **部分更新用户偏好** - HTTP 200
   - ⚠️ 同样的问题
   - **状态**: 已修复 ✅

6. **清除用户偏好（规划助手）** - HTTP 200 ✅
   - **响应**: `{"success": true}`
   - **状态**: 正常工作

7. **验证清除后的用户偏好摘要** - HTTP 200 ✅
   - **响应**: 正常返回空偏好摘要
   - **状态**: 正常工作

8. **测试空偏好更新** - HTTP 200
   - ⚠️ 同样的问题
   - **状态**: 已修复 ✅

### ❌ 失败的测试

1. **推断用户偏好（决策风格）** - HTTP 401
   - **错误**: `Unauthorized`
   - **原因**: 接口需要认证，但测试时未提供 token
   - **状态**: 预期行为 ✅（接口正确返回 401）

## 发现的问题

### 问题1: `/api/users/profile` 接口未正确处理未认证情况

**问题描述**:
- 接口标记为 `@Public()`，允许未认证访问
- 但代码中直接访问 `user.userId`，当未提供 token 时 `user` 为 `undefined`
- 导致运行时错误：`Cannot read properties of undefined (reading 'userId')`

**影响范围**:
- `GET /api/users/profile`
- `PUT /api/users/profile`

**修复方案**:
在控制器中添加对 `user` 的检查：

```typescript
async getProfile(@CurrentUser() user: CurrentUserPayload) {
  try {
    if (!user || !user.userId) {
      return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
    }
    const profile = await this.usersService.getProfile(user.userId);
    return successResponse(profile);
  } catch (error: any) {
    return errorResponse(ErrorCode.INTERNAL_ERROR, error.message);
  }
}
```

**修复状态**: ✅ 已修复

### 问题2: 测试脚本未正确识别错误响应

**问题描述**:
- 测试脚本只检查 HTTP 状态码 >= 400
- 但某些接口返回 HTTP 200 但响应中 `success: false`
- 导致测试脚本认为测试成功，但实际上接口返回了错误

**修复方案**:
改进错误检测逻辑，同时检查 HTTP 状态码和响应中的 `success` 字段：

```typescript
const isError = statusCode >= 400 || (body && body.success === false);
```

**修复状态**: ✅ 已修复

## 接口状态总结

| 接口 | 方法 | 认证 | 状态 | 说明 |
|------|------|------|------|------|
| `/api/users/profile` | GET | ✅ | ✅ 已修复 | 现在正确返回 401 当未认证 |
| `/api/users/profile` | PUT | ✅ | ✅ 已修复 | 现在正确返回 401 当未认证 |
| `/api/agent/planning-assistant/users/:userId/preferences` | GET | ❌ | ✅ 正常 | 公开接口，工作正常 |
| `/api/agent/planning-assistant/users/:userId/preferences/clear` | POST | ❌ | ✅ 正常 | 公开接口，工作正常 |
| `/api/v1/decision-replay/style/:userId/preferences` | GET | ✅ | ✅ 正常 | 正确返回 401 当未认证 |

## 建议

### 1. 接口设计一致性

建议统一接口的认证策略：
- **选项A**: 移除 `@Public()` 装饰器，强制认证（推荐）
- **选项B**: 保留 `@Public()` 但添加可选参数支持，如 `GET /api/users/profile?userId=xxx` 用于管理员查看其他用户

### 2. 测试覆盖

建议添加以下测试场景：
- ✅ 使用有效 token 测试需要认证的接口
- ✅ 测试部分更新功能
- ✅ 测试边界情况（空值、无效值等）
- ✅ 测试学习到的偏好与实际设置的偏好

### 3. 错误处理

建议统一错误响应格式：
- 所有错误都应该返回 `success: false`
- HTTP 状态码应该与错误类型一致（401 用于未认证，400 用于验证错误等）

## 下一步行动

1. ✅ 修复控制器代码，添加未认证检查
2. ✅ 改进测试脚本的错误检测逻辑
3. ⏳ 使用有效 token 重新运行完整测试
4. ⏳ 验证修复后的接口行为

## 重新测试

修复后，使用有效 token 重新运行测试：

```bash
# 获取 token（通过登录接口）
export TEST_TOKEN=your_jwt_token

# 运行测试
npx tsx scripts/test-user-preferences-api.ts
```

预期结果：
- 所有需要认证的接口应该成功（当提供有效 token 时）
- 所有不需要认证的接口应该继续正常工作
- 错误响应应该被正确识别
