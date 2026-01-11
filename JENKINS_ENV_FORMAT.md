# Jenkins .env 文件格式说明

## 问题

在 Migrate 阶段出现错误：
```
ERROR: identifier too long
DETAIL: Identifier must be less than 64 characters.
```

这通常是因为 `.env` 文件格式不正确，导致 `DATABASE_URL` 被错误解析。

## 正确的 .env 格式

### ✅ 正确格式

```bash
# 数据库连接（必须用引号包裹，特别是包含特殊字符时）
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=disable"

# 其他环境变量
APIFY_API_TOKEN="your_token_here"
VITE_MAPBOX_ACCESS_TOKEN="your_token_here"

# 每个变量占一行，不要有多余的空格或换行
```

### ❌ 错误格式

```bash
# 错误1: 没有引号（如果包含特殊字符会出问题）
DATABASE_URL=postgresql://user:password@host:5432/database?sslmode=disable

# 错误2: 值被分割到多行
DATABASE_URL="postgresql://user:password@host:5432/
database?sslmode=disable"

# 错误3: 变量之间没有换行
DATABASE_URL="postgresql://..." APIFY_API_TOKEN="..."

# 错误4: 值中包含未转义的特殊字符
DATABASE_URL=postgresql://user:pass@word@host:5432/db
```

## 在 Jenkins Credentials 中配置

1. 进入 Jenkins → Credentials → tripnara-dotenv-prod
2. 确保 Secret 内容格式正确：
   - 每个环境变量占一行
   - 使用 `KEY="VALUE"` 格式（值用引号包裹）
   - 不要在行尾有多余空格
   - 确保每行以换行符结束（最后一行也要有换行符）

## 示例 .env 文件

```bash
# 数据库
DATABASE_URL="postgresql://user:password@pgm-bp11qeau0n455339mo.pg.rds.aliyuncs.com:5432/tripnara_prod?sslmode=disable"

# API Keys
APIFY_API_TOKEN="apify_api_xxx"
VITE_MAPBOX_ACCESS_TOKEN="pk.xxx"

# 其他配置
NODE_ENV="production"
PORT="3000"
```

## 验证方法

在 Jenkins 构建的 "Write .env from Jenkins Credentials" 阶段后，可以添加一个验证步骤：

```bash
# 验证 DATABASE_URL 格式
if [ -f .env ]; then
  echo "检查 .env 文件格式..."
  grep "^DATABASE_URL=" .env | head -1
fi
```

## 常见问题

### 问题1: identifier too long

**原因**: `DATABASE_URL` 的值被错误解析，可能包含了其他环境变量的内容。

**解决**: 检查 Jenkins Credentials 中的 `.env` 内容，确保：
- 每个变量独立一行
- 值用引号包裹
- 没有多余的空格或特殊字符

### 问题2: 环境变量值被截断

**原因**: `.env` 文件可能没有正确的换行符。

**解决**: 确保每个环境变量后都有换行符（包括最后一行）。

### 问题3: 特殊字符导致解析错误

**原因**: 密码或 URL 中包含特殊字符（如 `@`, `:`, `/`, `?` 等）。

**解决**: 使用引号包裹整个值，或对特殊字符进行 URL 编码。
