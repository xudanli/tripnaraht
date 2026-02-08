# Planning Assistant V2 速率限制策略

**制定日期**: 2026-02-08  
**状态**: ✅ **实施完成**

---

## 🎯 速率限制策略

### 设计原则

1. **分层限流**: 根据接口类型设置不同的限流规则
2. **用户友好**: 公开接口限流较宽松，保护接口限流较严格
3. **防止滥用**: 防止恶意请求和 API 滥用
4. **成本控制**: 控制 LLM 调用成本

---

## 📋 接口限流规则

### 公开接口（允许匿名访问）

| 接口 | 限流规则 | 说明 |
|------|---------|------|
| `POST /sessions` | 10 次/分钟 | 防止频繁创建会话 |
| `GET /recommendations` | 20 次/分钟 | 推荐查询限流 |
| `POST /chat` | 30 次/分钟 | 对话接口限流（LLM 调用成本高） |

### 受保护接口（需要认证）

| 接口 | 限流规则 | 说明 |
|------|---------|------|
| `GET /sessions/:sessionId` | 100 次/分钟 | 查询接口限流较宽松 |
| `DELETE /sessions/:sessionId` | 10 次/分钟 | 删除操作限流 |
| `GET /sessions/:sessionId/history` | 60 次/分钟 | 历史查询限流 |
| `POST /plans/generate` | 10 次/分钟 | 方案生成（同步，LLM 调用） |
| `POST /plans/generate-async` | 20 次/分钟 | 方案生成（异步） |
| `GET /plans/generate/:taskId` | 60 次/分钟 | 任务状态查询 |
| `GET /plans/compare` | 20 次/分钟 | 方案对比（计算密集型） |
| `POST /plans/:planId/optimize` | 10 次/分钟 | 方案优化（LLM 调用） |
| `POST /plans/:planId/confirm` | 10 次/分钟 | 确认方案（数据库操作） |
| `POST /trips/:tripId/optimize` | 10 次/分钟 | 优化行程（LLM 调用） |
| `POST /trips/:tripId/refine` | 10 次/分钟 | 细化行程（LLM 调用） |
| `GET /trips/:tripId/suggestions` | 30 次/分钟 | 获取建议（查询接口） |

---

## 🔧 实施计划

### 阶段1: 安装和配置 ✅

1. ✅ 安装 `@nestjs/throttler` 包
2. ✅ 在 `PlanningAssistantModule` 中配置 `ThrottlerModule`
3. ✅ 注册全局 `ThrottlerGuard`

### 阶段2: 应用限流规则 ✅

1. ✅ 为公开接口设置限流装饰器
2. ✅ 为受保护接口设置限流装饰器
3. ✅ 限流响应头（X-RateLimit-*）由 `@nestjs/throttler` 自动添加

### 阶段3: 错误处理和文档 ✅

1. ✅ 限流错误响应由 `@nestjs/throttler` 自动处理（返回 429 Too Many Requests）
2. ⏳ 更新 Swagger 文档（添加限流说明）
3. ✅ 更新 API 文档

---

## 📝 代码示例

### 配置 ThrottlerModule

```typescript
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 分钟
      limit: 100, // 默认限制：100 次/分钟
    }]),
  ],
})
export class PlanningAssistantModule {}
```

### 使用限流装饰器

```typescript
import { Throttle } from '@nestjs/throttler';

@Controller('agent/planning-assistant/v2')
export class PlanningAssistantV2Controller {
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 次/分钟
  @Post('sessions')
  async createSession() {
    // ...
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } }) // 30 次/分钟
  @Post('chat')
  async chat() {
    // ...
  }
}
```

---

## 🔄 后续优化

1. ⏳ **基于用户的限流**: 根据用户类型（免费/付费/企业）设置不同限流
2. ⏳ **动态限流**: 根据系统负载动态调整限流规则
3. ⏳ **限流统计**: 记录限流事件，用于分析和优化

---

**参考文档**:
- `API_RATE_LIMITING.md` - 全局 API 限流规范
- `AUTHENTICATION_STRATEGY.md` - 身份验证策略
