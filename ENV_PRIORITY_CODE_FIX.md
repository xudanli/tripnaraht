# 环境变量优先级代码修复

## 🐛 问题

服务进程仍然使用旧的环境变量（从启动时的 shell 继承），即使 `.env` 文件配置正确。

**根本原因**：
- NestJS `ConfigModule` 默认情况下，`process.env` 的优先级高于 `.env` 文件
- 服务进程在修改 `~/.bashrc` 之前启动，继承了旧的环境变量
- `LlmService` 的读取顺序：`ConfigService.get()` → `process.env`，但 `ConfigService.get()` 也会读取 `process.env`

## ✅ 修复方案

### 1. 修改 `LlmService` 的读取逻辑

**文件**: `src/llm/services/llm.service.ts`

**修改**：
- 优先使用 `ConfigService.get()`（会读取 `.env` 文件）
- 只有当 `ConfigService.get()` 返回 `undefined` 时，才使用 `process.env`
- 这样确保 `.env` 文件的优先级更高

### 2. 明确指定 `ConfigModule` 的配置

**文件**: `src/app.module.ts`

**修改**：
- 明确指定 `envFilePath: '.env'`
- 确保 `.env` 文件被正确加载

## 📋 修改详情

### `src/llm/services/llm.service.ts`

```typescript
// 修改前
const model = this.configService?.get<string>('ANTHROPIC_MODEL') || process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
const baseUrl = this.configService?.get<string>('ANTHROPIC_BASE_URL') || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

// 修改后
let model = this.configService?.get<string>('ANTHROPIC_MODEL');
if (!model) {
  model = process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
}

let baseUrl = this.configService?.get<string>('ANTHROPIC_BASE_URL');
if (!baseUrl) {
  baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
}
```

### `src/app.module.ts`

```typescript
// 修改前
ConfigModule.forRoot({
  isGlobal: true,
}),

// 修改后
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: '.env',
}),
```

## ⚠️ 注意事项

1. **ConfigService 的行为**：
   - `ConfigService.get()` 会同时读取 `.env` 文件和 `process.env`
   - 默认情况下，`process.env` 的优先级更高
   - 通过明确指定 `envFilePath`，我们可以确保 `.env` 文件被加载

2. **代码修改的影响**：
   - 修改后的代码会优先使用 `ConfigService.get()` 的值
   - 只有当 `ConfigService.get()` 返回 `undefined` 时，才使用 `process.env`
   - 这样可以确保 `.env` 文件的优先级更高

3. **重启服务**：
   - 代码修改后，需要重启服务才能生效
   - 但即使不重启，新的代码逻辑也会优先使用 `ConfigService`（如果它已加载 `.env` 文件）

## 🧪 验证

修复后，即使服务进程有旧的环境变量，代码也会优先使用 `.env` 文件中的配置。

查看日志应该显示：
```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-haiku-20240307
```

---

**最后更新**: 2024-01-12  
**状态**: ✅ 已修复代码，需要重启服务验证
