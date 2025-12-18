# Agent 模块 Swagger 配置验证

## ✅ 配置检查清单

### 1. Controller 配置 ✅
- [x] `@ApiTags('agent')` - 已添加到 `AgentController`
- [x] `@ApiOperation()` - 已添加详细描述
- [x] `@ApiBody()` - 已添加请求体文档和示例
- [x] `@ApiResponse()` - 已添加响应文档（200, 400, 500）

### 2. Module 配置 ✅
- [x] `AgentController` 已注册到 `AgentModule.controllers`
- [x] `AgentModule` 已导入到 `AppModule`

### 3. Swagger 全局配置 ✅
- [x] `main.ts` 中已添加 `agent` tag
- [x] Tag 描述: "智能体统一入口（COALA + ReAct 双系统架构）"

### 4. DTO 配置 ✅
- [x] `RouteAndRunRequestDto` - 所有属性都有 `@ApiProperty` 或 `@ApiPropertyOptional`
- [x] `RouteAndRunResponseDto` - 所有属性都有 `@ApiProperty`
- [x] `ConversationContextDto` - 所有属性都有 `@ApiPropertyOptional`
- [x] `AgentOptionsDto` - 所有属性都有 `@ApiPropertyOptional`

## 🔍 验证步骤

### 1. 启动服务器
```bash
npm run backend:dev
# 或
npm run start:dev
```

### 2. 访问 Swagger UI
打开浏览器访问: http://localhost:3000/api

### 3. 检查 Agent 端点
在 Swagger UI 中应该能看到：
- **Tag**: `agent` - 智能体统一入口（COALA + ReAct 双系统架构）
- **Endpoint**: `POST /agent/route_and_run`
- **描述**: 智能体统一入口 - 路由并执行

### 4. 检查 OpenAPI JSON
访问: http://localhost:3000/api-json

搜索 `"/agent/route_and_run"` 应该能找到端点定义。

## 🐛 常见问题排查

### 问题 1: Swagger UI 中没有显示 agent 端点

**可能原因**:
1. 服务器没有重新启动
2. 编译错误导致 Controller 未加载
3. AgentModule 未正确导入

**解决方法**:
```bash
# 1. 检查编译错误
npm run build

# 2. 重新启动服务器
npm run backend:dev

# 3. 检查 AgentModule 是否在 AppModule 中
grep -r "AgentModule" src/app.module.ts
```

### 问题 2: Swagger UI 显示但端点不可用

**可能原因**:
1. DTO 类型定义问题
2. 验证装饰器冲突

**解决方法**:
```bash
# 检查 DTO 文件是否有编译错误
npm run build 2>&1 | grep -i "dto\|agent"
```

### 问题 3: 端点显示但缺少详细信息

**可能原因**:
1. `@ApiProperty` 装饰器缺失
2. 示例值未设置

**解决方法**:
检查 `src/agent/dto/route-and-run.dto.ts` 确保所有属性都有 `@ApiProperty` 或 `@ApiPropertyOptional`。

## 📋 当前配置状态

### Controller 文件
- **路径**: `src/agent/agent.controller.ts`
- **状态**: ✅ 已配置 Swagger 装饰器

### DTO 文件
- **路径**: `src/agent/dto/route-and-run.dto.ts`
- **状态**: ✅ 所有属性已添加 Swagger 装饰器

### Module 文件
- **路径**: `src/agent/agent.module.ts`
- **状态**: ✅ Controller 已注册

### 全局配置
- **路径**: `src/main.ts`
- **状态**: ✅ Agent tag 已添加

## 🎯 预期结果

启动服务器后，在 Swagger UI (http://localhost:3000/api) 中应该能看到：

```
agent
  └── POST /agent/route_and_run
      ├── 描述: 智能体统一入口 - 路由并执行
      ├── 请求示例: 3 个（简单查询、规划请求、条件分支）
      └── 响应: 200, 400, 500
```

## 📝 快速验证命令

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

## ✅ 验证通过标准

- [ ] 服务器可以正常启动
- [ ] Swagger UI 可以访问 (http://localhost:3000/api)
- [ ] `agent` tag 出现在 Swagger UI 中
- [ ] `POST /agent/route_and_run` 端点出现在 Swagger UI 中
- [ ] 请求体示例可以正常显示
- [ ] 响应文档可以正常显示
- [ ] 可以在 Swagger UI 中执行测试请求

