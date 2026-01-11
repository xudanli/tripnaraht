# 如何执行 SQL 查询

## ❌ 错误的方式

**不能在 bash 中直接执行 SQL：**

```bash
# ❌ 这样会报错
SELECT column_name FROM information_schema.columns WHERE table_name = 'Trip';
# bash: SELECT: command not found
```

## ✅ 正确的方式

### 方式 1：使用 ts-node + Prisma（推荐）

```bash
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.\$queryRaw\`
  SELECT column_name, data_type, column_default 
  FROM information_schema.columns 
  WHERE table_name = 'Trip' AND column_name = 'status'
\`.then(r => {
  console.log(JSON.stringify(r, null, 2));
  prisma.\$disconnect();
});
"
```

### 方式 2：使用 psql 命令行工具

如果系统安装了 `postgresql-client`，可以使用 `psql`：

```bash
# 从 .env 文件读取 DATABASE_URL
source .env
psql "$DATABASE_URL" -c "
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'Trip' AND column_name = 'status';
"
```

或者交互式使用：

```bash
psql "$DATABASE_URL"
# 进入 psql 后，直接输入 SQL 语句
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'Trip' AND column_name = 'status';
```

### 方式 3：使用数据库管理工具

使用图形化工具：
- **pgAdmin**
- **DBeaver**
- **TablePlus**
- **DataGrip**

连接到数据库后，在 SQL 编辑器中执行查询。

### 方式 4：创建 SQL 脚本文件

创建文件 `check-status.sql`：

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'Trip' AND column_name = 'status';
```

然后执行：

```bash
# 使用 psql
psql "$DATABASE_URL" -f check-status.sql

# 或使用 ts-node
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
const prisma = new PrismaClient();
const sql = readFileSync('check-status.sql', 'utf-8');
prisma.\$queryRawUnsafe(sql).then(r => {
  console.log(JSON.stringify(r, null, 2));
  prisma.\$disconnect();
});
"
```

## 当前 status 字段状态

✅ **字段已存在**：

- **字段名**: `status`
- **数据类型**: `text`
- **默认值**: `'PLANNING'`

## 常用查询示例

### 查看表结构

```bash
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.\$queryRaw\`
  SELECT column_name, data_type, is_nullable, column_default 
  FROM information_schema.columns 
  WHERE table_name = 'Trip'
  ORDER BY ordinal_position
\`.then(r => {
  console.log(JSON.stringify(r, null, 2));
  prisma.\$disconnect();
});
"
```

### 查看所有表的列表

```bash
npx ts-node -e "
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.\$queryRaw\`
  SELECT table_name 
  FROM information_schema.tables 
  WHERE table_schema = 'public' 
  ORDER BY table_name
\`.then(r => {
  console.log(JSON.stringify(r, null, 2));
  prisma.\$disconnect();
});
"
```

## 总结

- ✅ 使用 `npx ts-node -e "..."` + Prisma 查询（最方便）
- ✅ 使用 `psql` 命令行工具（如果已安装）
- ✅ 使用数据库管理工具（图形化界面）
- ❌ **不要**在 bash 中直接执行 SQL 语句
