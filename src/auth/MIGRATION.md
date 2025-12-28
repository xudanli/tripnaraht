# 数据库迁移指南

## ✅ 迁移完成

使用 `prisma db push` 成功将 User 和 RefreshToken 表推送到数据库。

## 迁移步骤（已完成）

1. **生成 Prisma Client**
```bash
npx prisma generate
```

2. **推送 Schema 到数据库**
```bash
npx prisma db push --skip-generate
```

3. **重新生成 Prisma Client**
```bash
npx prisma generate
```

## 迁移内容

迁移已添加以下表：

### `users` 表
- `id` (UUID, 主键)
- `google_sub` (唯一索引) - Google 用户唯一 ID
- `email` (唯一索引)
- `email_verified` (Boolean)
- `display_name` (String, 可选)
- `avatar_url` (String, 可选)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### `refresh_tokens` 表
- `id` (UUID, 主键)
- `user_id` (UUID, 外键 -> users.id, 级联删除)
- `token_hash` (Text) - bcrypt 哈希的刷新令牌
- `expires_at` (DateTime)
- `created_at` (DateTime)
- `revoked_at` (DateTime, 可选)

索引：
- `user_id` 索引
- `token_hash` 索引
- `expires_at` 索引

### `user_profiles` 表（已更新）
- `user_id` 现在关联到 `users.id` (UUID)
- 添加了外键约束和级联删除

## 验证

你可以通过以下方式验证表是否创建成功：

```sql
-- 连接到数据库
psql $DATABASE_URL

-- 检查表是否存在
\dt users
\dt refresh_tokens

-- 检查表结构
\d users
\d refresh_tokens
\d user_profiles
```

## 注意事项

1. **生产环境**：使用了 `prisma db push` 而不是 `prisma migrate`，因为数据库迁移历史与本地不同步。这是安全的，因为只是添加新表，没有修改或删除现有数据。

2. **数据迁移**：如果 `user_profiles` 表中已有数据，需要确保 `user_id` 字段是有效的 UUID 格式。如果现有数据使用字符串 ID，需要先进行数据迁移。

3. **外键约束**：`user_profiles.user_id` 现在通过外键关联到 `users.id`，并设置了级联删除。

4. **备份**：在生产环境执行任何数据库操作前，建议先备份数据库。

## 下一步

1. 配置环境变量（见 `.env.example`）
2. 启动服务测试认证功能
3. 在前端集成 Google OAuth（见 `src/auth/README.md`）
