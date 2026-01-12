# 修复 .env 文件中的重复配置

## ⚠️ 发现的问题

`.env` 文件中有**重复的 ANTHROPIC_API_KEY 配置**：

- **第 34 行**：`ANTHROPIC_API_KEY="your-anthropic-api-key"` （旧配置，占位符）
- **第 62 行**：`ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060` （新配置，实际 API Key）

## 🔧 修复方法

### 方法 1: 手动编辑 .env 文件

1. 打开 `.env` 文件
2. 删除第 34-35 行的旧配置：
   ```bash
   # 删除这两行
   ANTHROPIC_API_KEY="your-anthropic-api-key"
   ANTHROPIC_MODEL="claude-3-haiku-20240307"
   ```
3. 保留第 62-63 行的新配置：
   ```bash
   ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
   ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
   ```

### 方法 2: 使用命令行修复

```bash
# 备份原文件
cp .env .env.backup

# 删除旧配置（第 34-35 行）
sed -i '34,35d' .env

# 验证修复结果
grep -n "^ANTHROPIC" .env
```

**预期结果**：应该只看到第 60-61 行（删除后行号会变化）

## ✅ 修复后的配置

`.env` 文件应该只包含：

```bash
# Claude (Anthropic) API 配置
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

## 🔍 验证修复

### 1. 检查配置

```bash
# 应该只看到一行 ANTHROPIC_API_KEY
grep "^ANTHROPIC_API_KEY" .env

# 应该只看到一行 ANTHROPIC_MODEL
grep "^ANTHROPIC_MODEL" .env
```

### 2. 重启服务

```bash
# 停止服务
# Ctrl+C

# 重新启动
npm run dev
```

### 3. 验证配置生效

```bash
# 检查系统状态
curl http://localhost:3000/api/system/status | jq '.llm_provider'

# 应该返回 "anthropic"
```

## 📝 注意事项

1. **环境变量读取顺序**：
   - NestJS 的 ConfigService 会读取所有匹配的环境变量
   - 如果有重复，可能会使用第一个值（旧配置）
   - **必须删除旧配置**

2. **API Key 格式**：
   - 你的 API Key 格式：`sk_c8...`（正确）
   - 不需要引号（除非值中包含空格）
   - 建议格式：`ANTHROPIC_API_KEY=sk_c8...`（无引号）

3. **模型配置**：
   - 当前配置：`claude-3-5-sonnet-20241022`（推荐）
   - 这是最新的 Claude 3.5 Sonnet 模型

## 🚀 修复后的完整配置

```bash
# ============================================
# Claude (Anthropic) API 配置
# ============================================
ANTHROPIC_API_KEY=sk_c836cbb678829f61d36c57ee3723cd3814c69e2eae75e18885749f3c06a17060
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# ============================================
# Claude 编排功能（可选）
# ============================================
USE_CLAUDE_ORCHESTRATION=true
```

---

**重要**：修复后必须重启服务才能生效！
