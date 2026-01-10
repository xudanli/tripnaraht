FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
# 关键：先拷贝 prisma schema，确保 install/generate 时就能读到 schema
COPY prisma ./prisma

RUN npm ci

COPY . .
# 关键：显式生成 Prisma Client（避免 postinstall 在 schema 缺失时生成不完整）
# 设置一个假的 DATABASE_URL 用于生成类型（不需要实际连接）
ENV DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
RUN npx prisma generate
RUN npm run build


FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
