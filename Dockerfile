# =========================
# 多阶段构建 Dockerfile
# 第一阶段：构建阶段（builder）
# 用于编译 TypeScript 代码和生成 Prisma Client
# =========================

# 使用 Node.js 20 Alpine 镜像作为构建基础镜像
# Alpine 镜像体积小，适合生产环境
# AS builder: 为构建阶段命名，便于后续引用
FROM node:20-alpine AS builder

# 设置工作目录为 /app
# 后续所有命令都在此目录下执行
WORKDIR /app

# 复制依赖文件
# 先复制 package.json 和 package-lock.json，利用 Docker 缓存层优化
# 只有当依赖文件改变时，才会重新执行 npm ci
COPY package*.json ./

# 复制 Prisma schema 文件
# Prisma 需要 schema 文件来生成客户端代码
COPY prisma ./prisma

# 安装依赖
# npm ci: 使用 package-lock.json 进行确定性安装，比 npm install 更快且更可靠
# 适合 CI/CD 环境，确保依赖版本一致
RUN npm ci

# 复制所有源代码到容器
# 放在依赖安装之后，利用 Docker 缓存：代码变更不会导致重新安装依赖
COPY . .

# 设置临时数据库连接字符串
# 仅用于 prisma generate（不需要真实连接）
# prisma generate 只需要 schema 文件，不需要实际连接数据库
# 这个环境变量只是为了避免 Prisma 报错，实际值不重要
ENV DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# 生成 Prisma Client
# 根据 schema.prisma 文件生成类型安全的数据库客户端代码
RUN npx prisma generate

# 构建应用
# 编译 TypeScript 代码到 JavaScript（通常输出到 dist 目录）
RUN npm run build

# =========================
# 第二阶段：运行阶段（runner）
# 只包含运行时需要的文件，减小最终镜像体积
# =========================

# 使用新的 Node.js 20 Alpine 镜像作为运行环境
# 从干净的镜像开始，不包含构建工具和源代码
FROM node:20-alpine AS runner

# 设置工作目录
WORKDIR /app

# 设置生产环境变量
# 启用生产模式优化（如禁用调试信息、启用性能优化等）
ENV NODE_ENV=production

# 安装运行时依赖
# Prisma 在 Alpine 常需要 openssl/libc 兼容层（避免运行时报错）
# openssl: Prisma 连接数据库时需要 SSL 支持
# libc6-compat: 提供 glibc 兼容层，某些 Node.js 原生模块需要
# --no-cache: 不缓存包索引，减小镜像体积
RUN apk add --no-cache openssl libc6-compat

# 从构建阶段复制已安装的依赖
# 只复制 node_modules，不包含开发依赖（如果 package.json 配置了 production 安装）
COPY --from=builder /app/node_modules ./node_modules

# 复制 package.json 和 package-lock.json
# 某些运行时可能需要读取这些文件（如检查版本信息）
COPY --from=builder /app/package*.json ./

# 复制编译后的代码
# dist 目录包含编译后的 JavaScript 文件
COPY --from=builder /app/dist ./dist

# 复制 Prisma schema 和生成的客户端
# 运行时需要 Prisma schema 来执行迁移和查询
COPY --from=builder /app/prisma ./prisma

# 声明容器监听的端口
# 这只是文档说明，实际端口映射在 docker-compose.yml 或 docker run 时指定
EXPOSE 3000

# 容器启动时执行的命令
# 运行编译后的应用入口文件
CMD ["node", "dist/main.js"]