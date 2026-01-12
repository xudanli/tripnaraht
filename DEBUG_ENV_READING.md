# 调试环境变量读取问题

## 🔍 可能的问题

### 1. dotenv.config() 缓存问题

`dotenv.config()` 默认会缓存结果。如果 `.env` 文件在服务启动后被修改，可能需要清除缓存。

### 2. 服务未重启

代码修改后，**必须重启服务**才能生效。

### 3. 路径问题

`process.cwd()` 可能返回的不是项目根目录（特别是在 Docker 或某些部署环境中）。

## 🧪 调试步骤

### 1. 验证 dotenv 读取

```bash
cd /home/devbox/project
node -e "const dotenv = require('dotenv'); const path = require('path'); const envPath = path.resolve(process.cwd(), '.env'); const envConfig = dotenv.config({ path: envPath }).parsed || {}; console.log('ANTHROPIC_MODEL:', envConfig.ANTHROPIC_MODEL);"
```

### 2. 检查服务是否重启

查看服务进程的启动时间：
```bash
ps aux | grep "node.*nest\|npm.*dev" | grep -v grep
```

### 3. 添加调试日志

在 `callAnthropic` 方法中添加日志：

```typescript
const envPath = path.resolve(process.cwd(), '.env');
this.logger.debug(`[Anthropic] 读取 .env 文件: ${envPath}`);
const envConfig = dotenv.config({ path: envPath }).parsed || {};
this.logger.debug(`[Anthropic] .env 文件内容:`, {
  ANTHROPIC_MODEL: envConfig.ANTHROPIC_MODEL,
  ANTHROPIC_BASE_URL: envConfig.ANTHROPIC_BASE_URL,
});
```

## 🔧 可能的修复方案

### 方案 1: 清除 dotenv 缓存

```typescript
// 清除缓存后重新读取
delete require.cache[require.resolve('dotenv')];
const envConfig = dotenv.config({ path: envPath }).parsed || {};
```

### 方案 2: 使用绝对路径

```typescript
import * as fs from 'fs';
const envPath = path.resolve(__dirname, '../../.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envConfig = dotenv.parse(envContent);
```

### 方案 3: 在服务启动时读取并缓存

在 `LlmService` 构造函数中读取并缓存 `.env` 配置：

```typescript
private envConfig: Record<string, string> = {};

constructor(@Optional() private configService?: ConfigService) {
  // 在构造函数中读取并缓存
  const envPath = path.resolve(process.cwd(), '.env');
  this.envConfig = dotenv.config({ path: envPath }).parsed || {};
}
```

---

**最后更新**: 2024-01-12
