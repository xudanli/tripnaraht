# 环境变量优先级修复 - 最终方案

## ✅ 已完成的修复

### 问题根源

服务进程（PID 57564, 57576）在启动时继承了旧的环境变量：
- `ANTHROPIC_BASE_URL=https://aiproxy.hzh.sealos.run`
- `ANTHROPIC_MODEL=glm-4.6`

即使 `.env` 文件配置正确，NestJS `ConfigService` 默认情况下 `process.env` 的优先级高于 `.env` 文件。

### 解决方案

**修改 `LlmService` 直接从 `.env` 文件读取配置**，确保 `.env` 文件的优先级最高。

**文件**: `src/llm/services/llm.service.ts`

**修改内容**：
1. 导入 `dotenv` 和 `path` 模块
2. 在 `callAnthropic` 方法中，直接从 `.env` 文件读取配置
3. 优先级顺序：`.env` 文件 → `ConfigService` → `process.env`

## 📋 代码修改详情

### 导入模块

```typescript
import * as dotenv from 'dotenv';
import * as path from 'path';
```

### 读取配置逻辑

```typescript
// 优先从 .env 文件直接读取（确保 .env 文件的优先级高于 process.env）
const envPath = path.resolve(process.cwd(), '.env');
const envConfig = dotenv.config({ path: envPath }).parsed || {};

// 优先使用 .env 文件的值，如果 .env 文件中没有，再使用 process.env
const apiKey = envConfig.ANTHROPIC_API_KEY || this.configService?.get<string>('ANTHROPIC_API_KEY') || process.env.ANTHROPIC_API_KEY;
const model = envConfig.ANTHROPIC_MODEL || this.configService?.get<string>('ANTHROPIC_MODEL') || process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307';
const baseUrl = envConfig.ANTHROPIC_BASE_URL || this.configService?.get<string>('ANTHROPIC_BASE_URL') || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
```

## 🚀 下一步操作

### 1. 重启服务

**重要**：代码修改后，需要重启服务才能生效。

```bash
# 停止当前服务（Ctrl+C）
# 重新启动
npm run dev
```

### 2. 验证修复

重启后，查看日志应该显示：

**正确**：
```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-haiku-20240307
```

**错误**（如果仍然看到）：
```
[Anthropic] 调用 API: https://aiproxy.hzh.sealos.run/v1/messages, model: glm-4.6
```

## ✅ 优势

1. **不依赖服务重启时的环境变量**：即使服务进程有旧的环境变量，代码也会优先使用 `.env` 文件
2. **明确的优先级**：`.env` 文件 → `ConfigService` → `process.env`
3. **无需修改系统配置**：不需要清除系统环境变量或修改 `~/.bashrc`

## ⚠️ 注意事项

1. **性能影响**：每次调用 `callAnthropic` 时都会读取 `.env` 文件（但 `dotenv.config()` 有缓存机制）
2. **依赖检查**：确保 `dotenv` 包已安装（通常 NestJS 项目会包含）

## 📋 验证清单

- [x] 已修改 `LlmService` 代码
- [x] 已添加 `dotenv` 和 `path` 导入
- [x] 已实现 `.env` 文件优先读取逻辑
- [ ] 服务已重启
- [ ] 日志显示使用正确的配置

---

**最后更新**: 2024-01-12  
**状态**: ✅ 代码已修复，等待服务重启验证
