# 1) Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# 如果你有 lock 文件（强烈建议），npm ci 才能发挥价值
# 若没有 package-lock.json，先在本地/CI 生成并提交
RUN npm ci

COPY . .
RUN npm run build


# 2) Runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 只拷贝依赖定义，然后只安装生产依赖
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 拷贝编译产物
COPY --from=builder /app/dist ./dist

# 可选：更安全（alpine 里有 node 用户）
USER node

EXPOSE 3000
CMD ["node", "dist/main.js"]