# 第一阶段：构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 先拷贝依赖定义，利用 Docker 缓存层优化速度
COPY package*.json ./
RUN npm install

# 拷贝源代码并编译
COPY . .
RUN npm run build

# 第二阶段：运行阶段
FROM node:20-alpine

WORKDIR /app

# 只从构建阶段拷贝编译好的 dist 目录和生产依赖
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# 设置环境变量（生产环境）
ENV NODE_ENV=production

# TripNARA 后端默认端口
EXPOSE 3000

# 启动 NestJS 应用
CMD ["node", "dist/main.js"]