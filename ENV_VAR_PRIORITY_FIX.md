# 环境变量优先级问题修复

## 🐛 问题发现

从日志中发现，服务使用了错误的配置：

**日志显示**：
```
[Anthropic] 调用 API: https://aiproxy.hzh.sealos.run/v1/messages, model: glm-4.6
```

**期望配置**：
```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-haiku-20240307
```

## 🔍 根本原因

**系统环境变量覆盖了 .env 文件配置**：

```bash
# 系统环境变量（错误）
ANTHROPIC_BASE_URL=https://aiproxy.hzh.sealos.run
ANTHROPIC_MODEL=glm-4.6
ANTHROPIC_AUTH_TOKEN=

# .env 文件（正确，但被覆盖）
ANTHROPIC_BASE_URL=https://hongmacode.com/api
ANTHROPIC_MODEL=claude-3-haiku-20240307
```

在 NestJS 中，`process.env` 的优先级通常高于 `.env` 文件（取决于 ConfigModule 的配置）。

## ✅ 解决方案

### 方案 1: 清除系统环境变量（推荐）

```bash
# 在当前 shell 中清除
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_MODEL
unset ANTHROPIC_AUTH_TOKEN

# 然后重启服务
npm run dev
```

### 方案 2: 修改 shell 配置文件

如果环境变量在 `~/.bashrc` 或 `~/.bash_profile` 中设置：

```bash
# 编辑配置文件
nano ~/.bashrc

# 注释掉或删除这些行：
# export ANTHROPIC_BASE_URL=https://aiproxy.hzh.sealos.run
# export ANTHROPIC_MODEL=glm-4.6
# export ANTHROPIC_AUTH_TOKEN=

# 重新加载配置
source ~/.bashrc
```

### 方案 3: 在启动脚本中覆盖

创建启动脚本 `start.sh`：

```bash
#!/bin/bash
# 清除系统环境变量
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_MODEL
unset ANTHROPIC_AUTH_TOKEN

# 启动服务（会从 .env 文件读取配置）
npm run dev
```

### 方案 4: 修改代码优先级（不推荐）

修改 `LlmService` 的读取顺序，让 `.env` 文件优先级更高。但这需要修改代码，不推荐。

## 🧪 验证修复

修复后，重启服务，查看日志应该显示：

```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-haiku-20240307
```

而不是：

```
[Anthropic] 调用 API: https://aiproxy.hzh.sealos.run/v1/messages, model: glm-4.6
```

## 📋 检查清单

- [ ] 已清除系统环境变量 `ANTHROPIC_BASE_URL`
- [ ] 已清除系统环境变量 `ANTHROPIC_MODEL`
- [ ] 已清除系统环境变量 `ANTHROPIC_AUTH_TOKEN`
- [ ] 已检查 shell 配置文件（`~/.bashrc`, `~/.bash_profile`）
- [ ] 服务已重启
- [ ] 日志显示使用正确的配置

## ⚠️ 注意事项

1. **环境变量优先级**：
   - 系统环境变量 > `.env` 文件（在 NestJS 中）
   - 需要确保系统环境变量不会覆盖 `.env` 配置

2. **持久化配置**：
   - 如果需要在多个 shell 中使用，应该使用 `.env` 文件
   - 避免在 shell 配置文件中设置这些变量

3. **Docker 环境**：
   - 如果使用 Docker，确保环境变量在 `docker-compose.yml` 或容器启动时正确传递

---

**最后更新**: 2024-01-12  
**状态**: ⚠️ 需要清除系统环境变量
