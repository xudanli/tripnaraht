# .env 文件问题检查报告

## 发现的问题

### 1. 格式问题（缺少引号）

以下变量值应该用引号包裹（特别是包含特殊字符时）：

- ❌ 第3行：`VITE_MAPBOX_ACCESS_TOKEN=pk.eyJ1...` （应该用引号）
- ❌ 第5行：`AMAP_API_KEY=954fc3adc83862d59aa5a8637d42d700` （应该用引号）
- ❌ 第8-10行：Google API keys 没有引号
- ❌ 第13-18行：Redis 配置没有引号
- ❌ 第22行：`OPENAI_API_KEY=sk-proj-...` （很长的值，应该用引号）
- ❌ 第27行：`GEMINI_API_KEY=AIzaSy...` （应该用引号）
- ❌ 第31行：`DEEPSEEK_API_KEY=sk-...` （应该用引号）
- ❌ 第35行：`GOOGLE_VISION_API_KEY=AIzaSy...` （应该用引号）
- ❌ 第46-48行：Google OAuth 和 JWT 配置没有引号
- ❌ 第50行：`REACT_APP_API_URL=http://...` （应该用引号）
- ❌ 第51-52行：`FRONTEND_URL` 和 `FRONTEND_URLS` 没有引号

### 2. 重复项

- ❌ 第3行和第11行：`VITE_MAPBOX_ACCESS_TOKEN` 重复
- ❌ 第24行和第41行：`OPENAI_BASE_URL` 重复
- ❌ 第51行和第61行：`FRONTEND_URL` 重复

### 3. 注释格式问题

- ❌ 第23行：`OPENAI_MODEL=gpt-3.5-turbo  # 可选，默认 gpt-3.5-turbo`
  - 注释应该单独一行，或者值用引号包裹

### 4. 不必要的 export

- ❌ 第63-66行：使用了 `export`，在 `.env` 文件中不需要
  - 应该改为：`ENABLE_READINESS_MODULE=true`（不需要 `export`）

### 5. SMTP 配置

✅ 第55-60行：SMTP 配置格式正确，有引号
⚠️ 但需要确认 `SMTP_PASSWORD` 的值是否是真实的 Resend API Key

## 修复后的正确格式

```bash
# 数据库
DATABASE_URL="postgresql://tripnara_app:Ai685595@pgm-bp11qeau0n455339mo.pg.rds.aliyuncs.com:5432/tripnara_prod?sslmode=disable"

# API Keys
APIFY_API_TOKEN="apify_api_xxx"
VITE_MAPBOX_ACCESS_TOKEN="pk.xxx"

# 高德地图 API（国内必需）
AMAP_API_KEY="954fc3adc83862d59aa5a8637d42d700"

# Google Routes API（海外必需，国内降级使用）
GOOGLE_PLACES_API_KEY="AIzaSyAijgeh-6zJcnNWZRZ69uoS6KV3MJzKeM0"
GOOGLE_ROUTES_API_KEY="AIzaSyAijgeh-6zJcnNWZRZ69uoS6KV3MJzKeM0"
GOOGLE_MAPS_API_KEY="AIzaSyAijgeh-6zJcnNWZRZ69uoS6KV3MJzKeM0"

# Redis 配置
REDIS_HOST="tripnara-psql-postgresql.ns-50nmw0i7.svc"
REDIS_PORT="5432"
REDIS_PASSWORD="7vrshfqm"
REDIS_DB="0"
REDIS_TTL="3600"

# 应用配置
PORT="3000"

# LLM 语音解析
ENABLE_LLM_VOICE_PARSER="true"
OPENAI_API_KEY="sk-proj-xxx"
# OpenAI 模型（可选，默认 gpt-3.5-turbo）
OPENAI_MODEL="gpt-3.5-turbo"
OPENAI_BASE_URL="https://api.openai.com/v1"

# Gemini API
GEMINI_API_KEY="AIzaSyB2n6qdLxy6M4nbe062IMFLQWznceq4Dno"
# Gemini 模型（可选，默认 gemini-pro）
GEMINI_MODEL="gemini-pro"

# DeepSeek API
DEEPSEEK_API_KEY="sk-60906a27218242009933bf9bda10cd13"
DEEPSEEK_MODEL="deepseek-chat"

# Google OCR
GOOGLE_VISION_API_KEY="AIzaSyAsqIJEzfW1HWZj9U6poWVsFJ7i6eK3TAM"

# Anthropic API
ANTHROPIC_API_KEY="your-anthropic-api-key"
# Anthropic 模型（可选，默认 claude-3-haiku-20240307）
ANTHROPIC_MODEL="claude-3-haiku-20240307"

# Embedding 提供商
EMBEDDING_PROVIDER="openai"

# Google OAuth
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxx"
JWT_SECRET="xxx"

# 前端配置
REACT_APP_API_URL="http://47.253.148.159"
FRONTEND_URL="https://tripnara.com"
FRONTEND_URLS="https://tripnara.com,https://www.tripnara.com"

# SMTP 邮件服务配置
SMTP_HOST="smtp.resend.com"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="resend"
SMTP_PASSWORD="re_AbCdEf123456"
SMTP_FROM="noreply@tripnara.com"

# 模块启用配置
ENABLE_READINESS_MODULE="true"
ENABLE_PLACES_MODULE="true"
ENABLE_TRIPS_MODULE="true"
DISABLE_REDIS="true"
```

## 关键修复点

1. **所有值都用引号包裹**（特别是包含特殊字符的值）
2. **删除重复项**（`VITE_MAPBOX_ACCESS_TOKEN`、`OPENAI_BASE_URL`、`FRONTEND_URL`）
3. **注释单独一行**（不要在同一行使用 `#` 注释）
4. **删除 `export` 关键字**（`.env` 文件不需要）
5. **确认 SMTP_PASSWORD** 是否是真实的 Resend API Key

## 在 Jenkins Credentials 中更新

1. 复制修复后的格式
2. 替换 Jenkins Credentials 中的内容
3. 确认 `SMTP_PASSWORD` 是真实的 Resend API Key
4. 保存并重新触发构建
