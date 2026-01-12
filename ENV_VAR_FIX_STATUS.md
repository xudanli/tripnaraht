# 环境变量修复状态

## ✅ 已完成的修复

1. ✅ 已备份 `~/.bashrc` 文件
2. ✅ 已注释掉 `~/.bashrc` 中的 ANTHROPIC 配置
3. ✅ 已清除当前 shell 的环境变量
4. ✅ 已重新加载 shell 配置

## ⚠️ 重要：需要重启服务

**当前运行的服务进程仍然使用旧的环境变量**（在修复之前启动的）。

### 重启方法

**方法 1: 使用重启脚本（推荐）**

```bash
# 停止当前服务（Ctrl+C）
# 然后运行
./restart-service.sh
```

**方法 2: 手动重启**

```bash
# 1. 停止当前服务（Ctrl+C）

# 2. 确保环境变量已清除
unset ANTHROPIC_BASE_URL ANTHROPIC_MODEL ANTHROPIC_AUTH_TOKEN

# 3. 重新启动
npm run dev
```

**方法 3: 使用新终端**

```bash
# 打开新终端窗口
cd /home/devbox/project
npm run dev
```

## ✅ 验证修复

重启后，日志应该显示：

**正确**：
```
[Anthropic] 调用 API: https://hongmacode.com/api/v1/messages, model: claude-3-haiku-20240307
```

**错误**（如果仍然看到）：
```
[Anthropic] 调用 API: https://aiproxy.hzh.sealos.run/v1/messages, model: glm-4.6
```

## 📋 当前状态

- ✅ `~/.bashrc` 已修复（ANTHROPIC 配置已注释）
- ✅ 当前 shell 环境变量已清除
- ✅ `.env` 文件配置正确
- ⚠️ **服务需要重启**才能应用新配置

---

**最后更新**: 2024-01-12  
**状态**: ✅ 修复完成，等待服务重启
