# 重启服务指南 - 应用环境变量修复

## ⚠️ 当前状态

服务仍在运行，使用的是**旧的环境变量**（在修改 `~/.bashrc` 之前启动的进程）。

日志显示：
```
[Anthropic] 调用 API: https://aiproxy.hzh.sealos.run/v1/messages, model: glm-4.6
```

## 🔄 重启步骤

### 方法 1: 在当前终端重启（推荐）

```bash
# 1. 停止当前服务（按 Ctrl+C）

# 2. 清除当前 shell 的环境变量（如果还有）
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_MODEL
unset ANTHROPIC_AUTH_TOKEN

# 3. 重新加载 shell 配置
source ~/.bashrc

# 4. 验证环境变量已清除
env | grep -i anthropic
# 应该没有输出（或只有 .env 文件中的，如果已加载）

# 5. 重新启动服务
cd /home/devbox/project
npm run dev
```

### 方法 2: 使用新终端（最简单）

```bash
# 1. 打开新的终端窗口

# 2. 停止旧终端中的服务（Ctrl+C）

# 3. 在新终端中启动
cd /home/devbox/project
npm run dev
```

### 方法 3: 使用启动脚本（自动化）

创建 `restart-service.sh`：

```bash
#!/bin/bash
# 清除环境变量
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_MODEL
unset ANTHROPIC_AUTH_TOKEN

# 进入项目目录
cd /home/devbox/project

# 启动服务
npm run dev
```

然后运行：
```bash
chmod +x restart-service.sh
./restart-service.sh
```

## ✅ 验证修复

重启后，查看日志应该显示：

**正确的配置**：
```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-haiku-20240307
```

**错误的配置**（如果仍然看到，说明环境变量未清除）：
```
[Anthropic] 调用 API: https://aiproxy.hzh.sealos.run/v1/messages, model: glm-4.6
```

## 🔍 如果仍然有问题

### 检查 1: 确认 .env 文件配置

```bash
cd /home/devbox/project
cat .env | grep ANTHROPIC
```

应该看到：
```
ANTHROPIC_API_KEY=sk_c836cbb6...
ANTHROPIC_MODEL=claude-3-haiku-20240307
ANTHROPIC_BASE_URL=https://hongmacode.com/api
```

### 检查 2: 确认 ~/.bashrc 已修改

```bash
grep "^export ANTHROPIC" ~/.bashrc
```

应该**没有输出**（所有 ANTHROPIC 导出都已被注释）。

### 检查 3: 确认当前 shell 环境变量

```bash
env | grep ANTHROPIC
```

应该**没有输出**（或只有 .env 文件中的，如果已通过 ConfigModule 加载）。

### 检查 4: 检查是否有其他配置文件

```bash
# 检查 systemd 服务（如果使用）
systemctl status tripnara 2>/dev/null || echo "未使用 systemd"

# 检查 docker-compose（如果使用）
grep -r "ANTHROPIC" docker-compose.yml 2>/dev/null || echo "未使用 docker-compose"

# 检查其他 shell 配置文件
grep -r "ANTHROPIC" ~/.bash_profile ~/.profile ~/.zshrc 2>/dev/null || echo "未在其他配置文件中找到"
```

## 📋 完整检查清单

- [ ] 已停止当前运行的服务
- [ ] 已清除当前 shell 的环境变量（`unset`）
- [ ] 已重新加载 shell 配置（`source ~/.bashrc` 或新终端）
- [ ] 已确认 `~/.bashrc` 中的 ANTHROPIC 配置已注释
- [ ] 已确认 `.env` 文件配置正确
- [ ] 已重新启动服务
- [ ] 日志显示使用正确的配置

---

**最后更新**: 2024-01-12  
**状态**: ⚠️ 需要重启服务以应用修复
