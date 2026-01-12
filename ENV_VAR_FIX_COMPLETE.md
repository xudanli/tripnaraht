# 环境变量优先级问题修复完成

## ✅ 已完成的修复

### 问题根源

`~/.bashrc` 文件中设置了系统环境变量，覆盖了 `.env` 文件的配置：

```bash
# ~/.bashrc（已注释）
# export ANTHROPIC_BASE_URL=https://aiproxy.hzh.sealos.run
# export ANTHROPIC_MODEL=glm-4.6
# export ANTHROPIC_AUTH_TOKEN=
```

### 修复操作

1. ✅ 已备份 `~/.bashrc` 文件
2. ✅ 已注释掉 `~/.bashrc` 中的 ANTHROPIC 相关配置
3. ✅ `.env` 文件配置正确

## 🚀 下一步操作

### 1. 重新加载 shell 配置

```bash
source ~/.bashrc
```

或者打开新的终端窗口。

### 2. 验证环境变量

```bash
# 应该不再显示系统环境变量
env | grep -i anthropic

# 应该只看到 .env 文件中的配置（如果已加载）
```

### 3. 重启服务

**重要**：必须重启服务才能加载新的环境变量：

```bash
# 停止当前服务（Ctrl+C）
# 重新启动
npm run dev
```

### 4. 验证修复

重启后，查看日志应该显示：

```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-haiku-20240307
```

而不是：

```
[Anthropic] 调用 API: https://aiproxy.hzh.sealos.run/v1/messages, model: glm-4.6
```

## 📋 当前配置

### .env 文件（正确配置）

```bash
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-haiku-20240307
ANTHROPIC_BASE_URL=https://hongmacode.com/api
```

### ~/.bashrc（已注释）

```bash
# export ANTHROPIC_BASE_URL=https://aiproxy.hzh.sealos.run
# export ANTHROPIC_MODEL=glm-4.6
# export ANTHROPIC_AUTH_TOKEN=
```

## ✅ 验证清单

- [x] 已备份 `~/.bashrc` 文件
- [x] 已注释掉 `~/.bashrc` 中的 ANTHROPIC 配置
- [ ] 已重新加载 shell 配置（`source ~/.bashrc` 或新终端）
- [ ] 服务已重启
- [ ] 日志显示使用正确的配置

## 🔄 如果仍然有问题

如果重启后仍然使用错误的配置：

1. **检查当前 shell 的环境变量**：
   ```bash
   env | grep ANTHROPIC
   ```

2. **手动清除**（在当前 shell 中）：
   ```bash
   unset ANTHROPIC_BASE_URL
   unset ANTHROPIC_MODEL
   unset ANTHROPIC_AUTH_TOKEN
   ```

3. **在新终端中启动服务**：
   ```bash
   cd /home/devbox/project
   npm run dev
   ```

---

**最后更新**: 2024-01-12  
**状态**: ✅ 已修复，待重启服务验证
