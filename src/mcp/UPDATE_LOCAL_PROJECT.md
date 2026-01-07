# 更新本地项目指南

## 📋 场景说明

当您的本地 macOS 上已经有 TripNARA 项目，需要更新到最新版本时，按照以下步骤操作。

---

## 🔄 完整更新流程

### 步骤 1: 拉取最新代码

**操作位置**: 本地 macOS 终端（在项目目录下）

```bash
# 进入项目目录
cd ~/Projects/tripnara  # 或您的项目路径

# 拉取最新代码
git pull origin main
# 或者如果使用其他分支
git pull origin <your-branch>
```

### 步骤 2: 更新依赖

**操作位置**: 本地 macOS 终端（在项目目录下）

```bash
# 安装/更新 npm 依赖
npm install

# 如果 package-lock.json 有冲突，可能需要：
# rm -rf node_modules package-lock.json
# npm install
```

### 步骤 3: 更新数据库

**操作位置**: 本地 macOS 终端（在项目目录下）

#### 3.1 运行数据库迁移

```bash
# 方法 1: 开发环境（会创建迁移文件）
npm run prisma:migrate

# 方法 2: 直接推送 Schema（适用于迁移历史不同步）
npx prisma db push --skip-generate
```

#### 3.2 生成 Prisma Client

```bash
# 生成 Prisma Client（迁移后必须执行）
npm run prisma:generate
```

> **注意**: 如果数据库 Schema 有变化，必须先运行迁移，再生成 Prisma Client。

### 步骤 4: 更新环境变量（如果需要）

**操作位置**: 本地 macOS 终端（在项目目录下）

如果远程服务器上的 `.env` 文件有更新：

```bash
# 从远程服务器复制最新的 .env 文件
scp devbox@your-server:/home/devbox/project/.env .env

# 或者手动对比并更新
# 查看远程服务器的 .env（不复制，只查看）
ssh devbox@your-server "cat /home/devbox/project/.env"
```

### 步骤 5: 重新构建（如果需要）

**操作位置**: 本地 macOS 终端（在项目目录下）

如果项目有 TypeScript 编译：

```bash
# 构建项目
npm run build
```

> **注意**: 对于 MCP Server，通常不需要构建，因为使用 `npx tsx` 直接运行 TypeScript。

### 步骤 6: 验证更新

**操作位置**: 本地 macOS 终端（在项目目录下）

```bash
# 测试 MCP Server 是否能正常启动
npm run mcp:test

# 或者直接测试服务器
npm run mcp:skills
# 如果看到 "MCP Skills Server ready" 说明正常
```

---

## 🚀 一键更新脚本

创建一个脚本来自动化更新流程：

**操作位置**: 本地 macOS 终端

```bash
#!/bin/bash
# 保存为 update-project.sh，在 macOS 上执行

PROJECT_DIR="$HOME/Projects/tripnara"
SERVER_USER="devbox"
SERVER_HOST="your-server-ip"  # 修改为实际服务器地址

echo "🔄 开始更新项目..."
cd "$PROJECT_DIR" || exit 1

echo "📥 步骤 1: 拉取最新代码..."
git pull origin main || {
    echo "❌ Git pull 失败，请检查网络连接和分支名称"
    exit 1
}

echo "📦 步骤 2: 更新依赖..."
npm install || {
    echo "❌ npm install 失败"
    exit 1
}

echo "🗄️  步骤 3: 更新数据库..."
echo "   3.1 运行数据库迁移..."
npm run prisma:migrate || {
    echo "⚠️  迁移失败，尝试直接推送..."
    npx prisma db push --skip-generate || {
        echo "❌ 数据库更新失败"
        exit 1
    }
}

echo "   3.2 生成 Prisma Client..."
npm run prisma:generate || {
    echo "❌ Prisma Client 生成失败"
    exit 1
}

echo "🔐 步骤 4: 更新环境变量..."
read -p "是否从远程服务器更新 .env 文件? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    scp "${SERVER_USER}@${SERVER_HOST}:/home/devbox/project/.env" "$PROJECT_DIR/.env" || {
        echo "⚠️  .env 文件更新失败，请手动更新"
    }
fi

echo "🔨 步骤 5: 重新构建..."
npm run build || {
    echo "⚠️  构建失败，但可能不影响 MCP Server 运行"
}

echo "✅ 更新完成！"
echo ""
echo "🧪 测试 MCP Server..."
npm run mcp:test || {
    echo "⚠️  测试失败，请检查配置"
}

echo ""
echo "📝 下一步："
echo "   1. 如果 .env 有变化，请检查并更新配置"
echo "   2. 重启 Claude Desktop 以应用 MCP Server 更新"
```

### 使用方法

```bash
# 1. 创建脚本文件
cat > ~/update-tripnara.sh << 'SCRIPT_END'
# 粘贴上面的脚本内容
SCRIPT_END

# 2. 添加执行权限
chmod +x ~/update-tripnara.sh

# 3. 编辑脚本，修改 SERVER_HOST 等配置
nano ~/update-tripnara.sh

# 4. 运行脚本
~/update-tripnara.sh
```

---

## 📝 分步骤说明

### 如果只需要更新代码（不更新数据库）

```bash
cd ~/Projects/tripnara
git pull
npm install
```

### 如果只需要更新数据库

```bash
cd ~/Projects/tripnara
npm run prisma:migrate
npm run prisma:generate
```

### 如果只需要更新环境变量

```bash
cd ~/Projects/tripnara
scp devbox@your-server:/home/devbox/project/.env .env
```

---

## 🐛 常见问题

### 问题 1: Git 冲突

**症状**: `git pull` 时出现冲突

**解决**:
```bash
# 查看冲突文件
git status

# 手动解决冲突，或使用策略
git pull --rebase origin main
# 或
git pull --strategy-option theirs origin main  # 使用远程版本
```

### 问题 2: 数据库迁移失败

**症状**: `npm run prisma:migrate` 失败

**解决**:
```bash
# 方法 1: 直接推送（适用于开发环境）
npx prisma db push --skip-generate
npm run prisma:generate

# 方法 2: 重置迁移历史（谨慎使用，会丢失迁移历史）
npx prisma migrate reset
npm run prisma:generate
```

### 问题 3: Prisma Client 生成失败

**症状**: `npm run prisma:generate` 失败

**解决**:
```bash
# 清理并重新生成
rm -rf node_modules/.prisma
npm run prisma:generate
```

### 问题 4: 依赖安装失败

**症状**: `npm install` 失败

**解决**:
```bash
# 清理并重新安装
rm -rf node_modules package-lock.json
npm install

# 如果还有问题，清除 npm 缓存
npm cache clean --force
npm install
```

### 问题 5: .env 文件冲突

**症状**: 本地 `.env` 和远程不一致

**解决**:
```bash
# 备份本地 .env
cp .env .env.local.backup

# 从远程复制
scp devbox@your-server:/home/devbox/project/.env .env

# 手动对比并合并差异
diff .env.local.backup .env
```

---

## ✅ 更新检查清单

更新完成后，检查以下项目：

- [ ] 代码已拉取到最新版本（`git log -1`）
- [ ] 依赖已更新（`npm list --depth=0`）
- [ ] 数据库迁移已应用（`npx prisma migrate status`）
- [ ] Prisma Client 已生成（检查 `node_modules/.prisma`）
- [ ] `.env` 文件已更新（如果需要）
- [ ] MCP Server 可以正常启动（`npm run mcp:test`）
- [ ] Claude Desktop 配置正确（`~/Library/Application Support/Claude/claude_desktop_config.json`）

---

## 🎯 快速参考

### 最简更新（只更新代码）

```bash
cd ~/Projects/tripnara && git pull && npm install
```

### 完整更新（代码 + 数据库）

```bash
cd ~/Projects/tripnara && \
git pull && \
npm install && \
npm run prisma:migrate && \
npm run prisma:generate
```

### 完整更新（代码 + 数据库 + 环境变量）

```bash
cd ~/Projects/tripnara && \
git pull && \
npm install && \
npm run prisma:migrate && \
npm run prisma:generate && \
scp devbox@your-server:/home/devbox/project/.env .env
```

---

## 📚 相关文档

- [远程服务器配置指南](./REMOTE_SERVER_SETUP.md)
- [MCP Skills 使用指南](./MCP_SKILLS_GUIDE.md)
- [故障排除指南](./TROUBLESHOOTING.md)

