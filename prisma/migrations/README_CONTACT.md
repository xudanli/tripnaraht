# Contact 模块数据库迁移

## ✅ 迁移已完成

已使用 `prisma db push` 成功将 Contact 模块的表推送到数据库。

## 执行迁移的方法

### 方法 1: 直接推送（推荐，适用于迁移历史不同步的情况）

```bash
npx prisma db push --skip-generate
npm run prisma:generate
```

### 方法 2: 创建迁移文件（适用于迁移历史同步的情况）

```bash
npm run prisma:migrate dev --name add_contact_tables
npm run prisma:generate
```

### 方法 3: 生产环境部署

```bash
npm run prisma:migrate deploy
npm run prisma:generate
```

## 表结构

### contact_messages
- 存储联系消息的主要信息
- 支持匿名用户提交（userId 可为空）
- 状态字段：pending, read, replied, resolved

### contact_message_images
- 存储联系消息的图片文件信息
- 关联到 contact_messages 表
- 存储文件路径、文件名、大小、MIME 类型等信息

## 注意事项

- 迁移后需要重新生成 Prisma 客户端：`npm run prisma:generate`
- 确保上传目录存在：`uploads/contact`（或配置的环境变量 `CONTACT_UPLOAD_DIR`）
