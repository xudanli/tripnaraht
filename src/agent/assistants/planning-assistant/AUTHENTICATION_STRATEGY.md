# Planning Assistant V2 身份验证策略

**制定日期**: 2026-02-08  
**状态**: 实施中

---

## 🎯 身份验证策略

### 设计原则

1. **渐进式认证**: 支持匿名用户和认证用户
2. **会话所有权**: 会话属于创建它的用户
3. **资源保护**: 涉及用户数据的操作需要认证
4. **向后兼容**: 保持对匿名用户的支持（通过 `@Public()` 装饰器）

---

## 📋 接口分类

### ✅ 公开接口（保留 `@Public()`）

这些接口允许匿名访问，但如果有认证信息会更好：

1. **创建会话** (`POST /sessions`)
   - **原因**: 允许新用户快速开始
   - **可选**: 如果提供 `userId`，会话将与用户关联

2. **获取推荐** (`GET /recommendations`)
   - **原因**: 公开信息，不涉及用户数据
   - **可选**: 认证用户可以获得个性化推荐

3. **智能对话** (`POST /chat`)
   - **原因**: 主要入口，应该易于访问
   - **可选**: 认证用户可以获得更好的体验（偏好学习）

### 🔒 受保护接口（移除 `@Public()`，添加 `@UseGuards(JwtAuthGuard)`）

这些接口涉及用户数据，需要认证：

1. **获取会话状态** (`GET /sessions/:sessionId`)
   - **原因**: 包含用户数据，应该只有所有者可以访问
   - **验证**: 检查 `sessionId` 是否属于当前用户

2. **删除会话** (`DELETE /sessions/:sessionId`)
   - **原因**: 删除操作，应该只有所有者可以执行
   - **验证**: 检查 `sessionId` 是否属于当前用户

3. **获取对话历史** (`GET /sessions/:sessionId/history`)
   - **原因**: 包含用户数据
   - **验证**: 检查 `sessionId` 是否属于当前用户

4. **生成方案** (`POST /plans/generate`)
   - **原因**: 创建用户数据，需要认证
   - **验证**: 确保 `userId` 与当前用户匹配

5. **生成方案（异步）** (`POST /plans/generate-async`)
   - **原因**: 创建用户数据，需要认证
   - **验证**: 确保 `userId` 与当前用户匹配

6. **查询生成任务状态** (`GET /plans/generate/:taskId`)
   - **原因**: 查询用户任务，需要认证
   - **验证**: 检查任务是否属于当前用户

7. **对比方案** (`GET /plans/compare`)
   - **原因**: 涉及用户方案数据
   - **验证**: 检查方案是否属于当前用户

8. **优化方案** (`POST /plans/:planId/optimize`)
   - **原因**: 修改用户数据，需要认证
   - **验证**: 检查方案是否属于当前用户

9. **确认方案** (`POST /plans/:planId/confirm`)
   - **原因**: 创建行程，需要认证
   - **验证**: 确保 `userId` 与当前用户匹配

10. **优化已创建行程** (`POST /trips/:tripId/optimize`)
    - **原因**: 修改用户行程，需要认证
    - **验证**: 检查行程是否属于当前用户

11. **细化行程** (`POST /trips/:tripId/refine`)
    - **原因**: 修改用户行程，需要认证
    - **验证**: 检查行程是否属于当前用户

12. **获取优化建议** (`GET /trips/:tripId/suggestions`)
    - **原因**: 查询用户行程，需要认证
    - **验证**: 检查行程是否属于当前用户

---

## 🔐 实施计划

### 阶段1: 添加认证保护（当前）

1. ✅ 移除受保护接口的 `@Public()` 装饰器
2. ✅ 添加 `@UseGuards(JwtAuthGuard)` 到 Controller 类级别
3. ✅ 添加 `@ApiBearerAuth()` 到 Swagger 文档
4. ✅ 添加 `@CurrentUser()` 装饰器获取当前用户

### 阶段2: 添加资源所有权验证（后续）

1. ⏳ 在 Service 层添加资源所有权检查
2. ⏳ 添加自定义异常（`ForbiddenException`）
3. ⏳ 更新错误响应

### 阶段3: 添加速率限制（后续）

1. ⏳ 集成 `@nestjs/throttler`
2. ⏳ 为不同接口设置不同的速率限制

---

## 📝 代码变更示例

### Controller 级别认证

```typescript
@ApiTags('规划助手智能体 V2')
@ApiBearerAuth() // Swagger 文档
@UseGuards(JwtAuthGuard) // 默认保护所有接口
@Controller('agent/planning-assistant/v2')
export class PlanningAssistantV2Controller {
  // ...
}
```

### 公开接口

```typescript
@Public() // 明确标记为公开
@Post('sessions')
async createSession(@Body() dto: CreateSessionRequestDto): Promise<CreateSessionResponseDto> {
  return await this.planningAssistantV2Service.createSession(dto);
}
```

### 受保护接口

```typescript
// 不需要 @Public()，默认受保护
@Get('sessions/:sessionId')
async getSessionState(
  @Param('sessionId') sessionId: string,
  @CurrentUser() user?: { userId: string; email?: string }, // 可选，因为可能有公开接口
): Promise<SessionStateResponseDto> {
  return await this.planningAssistantV2Service.getSessionState(sessionId, user?.userId);
}
```

---

## ⚠️ 注意事项

1. **向后兼容**: 保留对匿名用户的支持（通过 `@Public()`）
2. **用户验证**: Service 层需要验证资源所有权
3. **错误处理**: 返回适当的 HTTP 状态码（401 Unauthorized, 403 Forbidden）
4. **文档更新**: 更新 API 文档，说明哪些接口需要认证

---

## 🧪 测试策略

1. **认证测试**: 测试未认证请求返回 401
2. **授权测试**: 测试访问他人资源返回 403
3. **公开接口测试**: 测试公开接口可以匿名访问
4. **用户关联测试**: 测试认证用户的请求正确关联用户

---

**实施状态**: ⏳ 进行中
