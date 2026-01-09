# 端口3000未监听问题诊断

## 🔍 问题现象

- ✅ 应用进程正在运行（`nest start --watch`）
- ❌ 端口3000未被监听
- ❌ 日志中没有显示 `API listening on http://0.0.0.0:3000`

## 📊 当前状态

从检查结果看：
- 进程ID存在：`21013` (nest start --watch)
- 端口3000未被监听
- 应用启动流程在 `app.listen()` 之前卡住了

## 🔎 可能的原因

### 1. Swagger 文档生成阻塞

`main.ts` 中在 `app.listen()` 之前需要：
1. 创建 Swagger 文档：`SwaggerModule.createDocument(app, config)`
2. 设置 Swagger UI：`SwaggerModule.setup('api-docs', app, document, ...)`

如果 Swagger 文档生成过程卡住，会导致无法执行到 `app.listen()`。

### 2. 模块初始化未完成

虽然所有模块的 `InstanceLoader` 都显示初始化完成，但可能：
- 某个模块的 `onModuleInit` 异步操作还在进行
- 某个模块的依赖注入还在等待
- 某个模块的初始化钩子（hook）卡住了

### 3. 中间件或拦截器阻塞

在 `app.listen()` 之前配置了：
- HTTP 访问日志拦截器
- HTTP 访问日志中间件
- 全局验证管道
- CORS 配置

如果这些配置过程中有异步操作未完成，可能阻塞启动。

## 🛠️ 诊断步骤

### 步骤 1: 检查完整启动日志

查看终端中是否有错误信息，特别是：
- Swagger 相关错误
- 模块初始化错误
- 异步操作超时

### 步骤 2: 检查是否有阻塞的异步操作

```bash
# 检查进程状态
ps aux | grep nest

# 检查是否有文件锁或网络连接
lsof -p $(pgrep -f "nest start" | head -1)
```

### 步骤 3: 临时禁用 Swagger 测试

修改 `src/main.ts`，临时注释掉 Swagger 配置：

```typescript
// 临时注释 Swagger 配置
// const document = SwaggerModule.createDocument(app, config);
// SwaggerModule.setup('api-docs', app, document, {...});

const port = Number(process.env.PORT ?? 3000);
await app.listen(port, '0.0.0.0');
console.log(`API listening on http://0.0.0.0:${port}`);
```

如果注释后能正常启动，说明问题在 Swagger 配置。

### 步骤 4: 添加调试日志

在 `src/main.ts` 的 `bootstrap()` 函数中添加更多日志：

```typescript
async function bootstrap() {
  console.log('🚀 [Bootstrap] 开始启动应用...');
  
  const app = await NestFactory.create(AppModule, {
    logger: logLevels,
  });
  console.log('✅ [Bootstrap] NestFactory 创建完成');
  
  // ... 中间件配置 ...
  console.log('✅ [Bootstrap] 中间件配置完成');
  
  // Swagger 配置
  console.log('📚 [Bootstrap] 开始配置 Swagger...');
  const config = new DocumentBuilder()...build();
  console.log('✅ [Bootstrap] Swagger config 创建完成');
  
  const document = SwaggerModule.createDocument(app, config);
  console.log('✅ [Bootstrap] Swagger document 创建完成');
  
  SwaggerModule.setup('api-docs', app, document, {...});
  console.log('✅ [Bootstrap] Swagger UI 设置完成');
  
  console.log('🌐 [Bootstrap] 开始监听端口...');
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`✅ [Bootstrap] API listening on http://0.0.0.0:${port}`);
}
```

这样可以定位到具体在哪一步卡住了。

## 🔧 快速解决方案

### 方案 1: 重启应用

```bash
# 停止当前进程
pkill -f "nest start"

# 重新启动
npm run dev
```

### 方案 2: 检查环境变量

确保没有环境变量导致阻塞：

```bash
# 检查关键环境变量
echo $DATABASE_URL
echo $PORT
echo $NODE_ENV
```

### 方案 3: 清理并重新构建

```bash
# 清理 node_modules 和构建缓存
rm -rf node_modules/.cache
rm -rf dist

# 重新启动
npm run dev
```

## 📝 预期行为

正常情况下，启动日志应该显示：

```
[Nest] 16647  - 01/09/2026, 5:37:09 PM     LOG [InstanceLoader] RouteDirectionsModule dependencies initialized +0ms
API listening on http://0.0.0.0:3000
📚 Swagger 文档: http://0.0.0.0:3000/api
```

如果缺少最后两行，说明启动流程未完成。

## 🎯 下一步行动

1. **立即检查**：查看终端中的完整启动日志，寻找错误信息
2. **添加调试日志**：在 `main.ts` 中添加更多 `console.log` 定位阻塞点
3. **临时禁用 Swagger**：测试是否是 Swagger 配置导致的问题
4. **检查模块初始化**：确认所有模块的 `onModuleInit` 都正常完成

## 📌 相关文件

- `src/main.ts` - 应用启动入口
- `src/app.module.ts` - 主应用模块
- `src/skills/skills.module.ts` - Skills 模块（可能有初始化逻辑）
