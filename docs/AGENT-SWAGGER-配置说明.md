# Agent 模块 Swagger 配置说明

## ✅ 配置状态

Agent 模块的 Swagger 配置**已完整**，所有必要的装饰器和配置都已添加。

## 📋 配置清单

### 1. Controller 配置 ✅

**文件**: `src/agent/agent.controller.ts`

- ✅ `@ApiTags('agent')` - Controller 标签
- ✅ `@ApiOperation()` - 详细的 API 操作描述
- ✅ `@ApiBody()` - 请求体文档，包含 3 个示例
- ✅ `@ApiResponse()` - 响应文档（200, 400, 500）

### 2. DTO 配置 ✅

**文件**: `src/agent/dto/route-and-run.dto.ts`

- ✅ `RouteAndRunRequestDto` - 所有属性都有 `@ApiProperty` 或 `@ApiPropertyOptional`
- ✅ `RouteAndRunResponseDto` - 所有属性都有 `@ApiProperty`
- ✅ `ConversationContextDto` - 所有属性都有 `@ApiPropertyOptional`
- ✅ `AgentOptionsDto` - 所有属性都有 `@ApiPropertyOptional`

**文件**: `src/agent/dto/router-output.dto.ts` (新增)

- ✅ `RouterOutputDto` - 路由输出 DTO，包含完整的类型定义
- ✅ `BudgetDto` - 预算信息 DTO
- ✅ `UIHintDto` - UI 提示信息 DTO

### 3. Module 配置 ✅

**文件**: `src/agent/agent.module.ts`

- ✅ `AgentController` 已注册到 `controllers` 数组
- ✅ `AgentModule` 已导入到 `AppModule`

### 4. Swagger 全局配置 ✅

**文件**: `src/main.ts`

- ✅ 已添加 `agent` tag
- ✅ Tag 描述: "智能体统一入口（COALA + ReAct 双系统架构）"

## 🔍 如何验证 Swagger 是否正常工作

### 步骤 1: 启动服务器

```bash
npm run backend:dev
# 或
npm run start:dev
```

### 步骤 2: 访问 Swagger UI

打开浏览器访问: **http://localhost:3000/api**

### 步骤 3: 查找 Agent 端点

在 Swagger UI 中应该能看到：

1. **Tags 列表**中应该有 `agent` tag
2. **展开 `agent` tag**后应该能看到：
   - `POST /agent/route_and_run` - 智能体统一入口 - 路由并执行

### 步骤 4: 检查端点详情

点击 `POST /agent/route_and_run` 应该能看到：

- **描述**: 详细的 API 描述，包括路由策略、System 1/System 2 说明
- **请求体**: 包含 3 个示例（简单查询、规划请求、条件分支）
- **响应**: 200, 400, 500 状态码的文档

### 步骤 5: 验证 OpenAPI JSON

访问: **http://localhost:3000/api-json**

搜索 `"/agent/route_and_run"` 应该能找到端点定义。

## 🐛 如果 Swagger 中没有显示 Agent 端点

### 可能原因 1: 服务器未启动或未重新启动

**解决方法**:
```bash
# 停止当前服务器（Ctrl+C）
# 重新启动
npm run backend:dev
```

### 可能原因 2: 编译错误

**解决方法**:
```bash
# 检查编译错误
npm run build

# 如果有错误，修复后重新启动
```

### 可能原因 3: AgentModule 未正确导入

**验证方法**:
```bash
# 检查 AppModule 是否包含 AgentModule
grep -r "AgentModule" src/app.module.ts
```

应该能看到：
```typescript
import { AgentModule } from './agent/agent.module';
// ...
AgentModule, // Agent 模块（Router + Orchestrator）
```

### 可能原因 4: Controller 未注册

**验证方法**:
```bash
# 检查 AgentModule 是否注册了 Controller
grep -A 5 "controllers:" src/agent/agent.module.ts
```

应该能看到：
```typescript
controllers: [AgentController],
```

## 📊 预期结果

启动服务器后，在 Swagger UI 中应该能看到：

```
📚 TripNara API 文档

Tags:
  - agent (智能体统一入口（COALA + ReAct 双系统架构）)
    └── POST /agent/route_and_run
        ├── 描述: 智能体统一入口 - 路由并执行
        ├── 请求示例: 
        │   ├── 简单查询
        │   ├── 规划请求
        │   └── 条件分支
        └── 响应: 200, 400, 500
```

## ✅ 快速验证命令

```bash
# 1. 编译检查
npm run build

# 2. 启动服务器（如果未运行）
npm run backend:dev

# 3. 检查 Swagger JSON（需要服务器运行）
curl http://localhost:3000/api-json | jq '.paths."/agent/route_and_run"'

# 4. 检查 tags
curl http://localhost:3000/api-json | jq '.tags[] | select(.name == "agent")'
```

## 🎯 总结

Agent 模块的 Swagger 配置**已完整**，包括：

- ✅ Controller 装饰器
- ✅ DTO 属性文档
- ✅ 请求/响应示例
- ✅ 详细的 API 描述
- ✅ 类型定义（RouterOutputDto）

如果 Swagger UI 中没有显示，请：
1. 确保服务器已启动
2. 访问 http://localhost:3000/api
3. 查找 `agent` tag
4. 如果仍然没有，检查服务器日志是否有错误

