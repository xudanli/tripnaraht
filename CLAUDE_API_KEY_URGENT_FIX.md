# ⚠️ Claude API Key 紧急修复

## 🚨 问题

生产环境出现认证错误：
```
Anthropic API error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}
```

## 🔍 根本原因

### 问题 1: API Key 格式错误 ❌

当前配置的 API Key：
```
sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
```

**这是 OpenAI 的 API Key 格式**（以 `sk_` 开头），不是 Anthropic 的格式！

### 问题 2: API Key 有引号 ❌

`.env` 文件中的配置：
```bash
ANTHROPIC_API_KEY="sk_c836cbb6..."  # ❌ 有引号
```

## ✅ 解决方案

### 1. 获取正确的 Anthropic API Key

**正确的 Anthropic API Key 格式**：
- 以 `sk-ant-api03-` 开头
- 例如：`sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

**获取方式**：
1. 访问 [Anthropic Console](https://console.anthropic.com/)
2. 登录账户
3. 进入 API Keys 页面
4. 创建新的 API Key 或使用现有的
5. 复制完整的 API Key（以 `sk-ant-api03-` 开头）

### 2. 修复 .env 文件

**步骤**：

```bash
# 1. 编辑 .env 文件
nano .env

# 2. 找到 ANTHROPIC_API_KEY 行，修改为：
ANTHROPIC_API_KEY=sk-ant-api03-你的实际API密钥

# 3. 确保：
#    - 没有引号
#    - 没有前后空格
#    - 使用正确的 Anthropic API Key（sk-ant-api03- 开头）
```

**或者使用脚本修复（仅移除引号，仍需手动替换正确的 API Key）**：

```bash
# 移除引号（但 API Key 本身格式不对，需要替换）
sed -i 's/^ANTHROPIC_API_KEY="\(.*\)"/ANTHROPIC_API_KEY=\1/' .env
```

### 3. 验证配置

```bash
# 检查格式
grep "^ANTHROPIC_API_KEY" .env

# 应该看到（无引号，正确的格式）：
# ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 4. 重启服务

```bash
# Docker 方式
docker restart tripnara-app

# 或直接运行
# 停止服务后重新启动
npm run dev
```

### 5. 验证修复

查看日志，应该不再出现 401 错误：

```bash
docker logs tripnara-app --tail 50 | grep -i anthropic
```

## 📋 检查清单

- [ ] 已从 Anthropic Console 获取正确的 API Key（`sk-ant-api03-` 开头）
- [ ] `.env` 文件中 `ANTHROPIC_API_KEY` 无引号
- [ ] `.env` 文件中 `ANTHROPIC_API_KEY` 无前后空格
- [ ] API Key 格式正确（`sk-ant-api03-` 开头）
- [ ] 服务已重启
- [ ] 日志中不再出现 401 错误

## ⚠️ 重要提示

**当前配置的 API Key (`sk_c836cbb6...`) 是 OpenAI 格式，不是 Anthropic 格式！**

即使移除了引号，这个 API Key 也无法用于 Anthropic API。

**必须替换为正确的 Anthropic API Key**（从 Anthropic Console 获取）。

## 🔗 相关链接

- [Anthropic API Keys](https://console.anthropic.com/settings/keys)
- [Anthropic API Documentation](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)

---

**状态**: ⚠️ **需要立即修复**  
**优先级**: 🔴 **高**  
**最后更新**: 2024-01-12
