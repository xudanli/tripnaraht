# 冰岛世界模型 - 生产部署指南

> **版本**: v1.0 (Phase 1-5 完成版)
> **更新时间**: 2026-02-14
> **适用环境**: Production / Staging

---

## 📋 部署概览

### 系统要求

| 组件 | 最低配置 | 推荐配置 |
|------|---------|---------|
| **Node.js** | 18.x | 20.x LTS |
| **PostgreSQL** | 14.x | 15.x + PostGIS 3.3 |
| **内存** | 2GB | 4GB+ |
| **CPU** | 2 核 | 4 核+ |
| **磁盘** | 20GB | 50GB+ |
| **网络** | 稳定互联网连接 | - |

### 依赖服务

| 服务 | 用途 | 必需 |
|------|------|------|
| **PostgreSQL + PostGIS** | 主数据库 | ✅ 必需 |
| **Open-Meteo API** | 天气预报 | ✅ 必需 |
| **road.is API** | F-Road 状态 | ⚠️ 可降级 |

---

## 🚀 部署步骤

### Step 1: 环境准备

#### 1.1 安装 Node.js

```bash
# 使用 nvm 安装 Node.js 20.x
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# 验证版本
node --version  # 应显示 v20.x.x
npm --version   # 应显示 10.x.x
```

#### 1.2 安装 PostgreSQL + PostGIS

**Ubuntu/Debian**:
```bash
# 添加 PostgreSQL 仓库
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt-get update

# 安装 PostgreSQL 15 + PostGIS
sudo apt-get install -y postgresql-15 postgresql-15-postgis-3

# 启动服务
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS (Homebrew)**:
```bash
brew install postgresql@15 postgis
brew services start postgresql@15
```

**Docker (推荐用于开发/测试)**:
```bash
docker run --name tripnara-postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=tripnara \
  -p 5432:5432 \
  -v tripnara-pgdata:/var/lib/postgresql/data \
  -d postgis/postgis:15-3.3
```

#### 1.3 创建数据库

```bash
# 连接到 PostgreSQL
sudo -u postgres psql

# 创建数据库和用户
CREATE DATABASE tripnara;
CREATE USER tripnara_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE tripnara TO tripnara_user;

# 连接到 tripnara 数据库
\c tripnara

# 启用 PostGIS 扩展
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

# 验证 PostGIS 安装
SELECT PostGIS_Version();

# 退出
\q
```

---

### Step 2: 代码部署

#### 2.1 克隆代码仓库

```bash
cd /opt
git clone https://github.com/your-org/tripnara.git
cd tripnara/tripnaraht
```

#### 2.2 安装依赖

```bash
# 安装 pnpm (推荐)
npm install -g pnpm

# 安装项目依赖
pnpm install

# 或使用 npm
npm install
```

#### 2.3 配置环境变量

创建 `.env` 文件:

```bash
# .env
NODE_ENV=production

# 数据库配置
DATABASE_URL="postgresql://tripnara_user:your_secure_password@localhost:5432/tripnara?schema=public"

# 应用配置
PORT=3000
LOG_LEVEL=info

# Cron 任务
CRON_ENABLED=true

# API 端点 (可选，使用默认值)
OPEN_METEO_API_URL=https://api.open-meteo.com/v1/forecast
ROAD_IS_API_URL=https://api.road.is/v1

# API 超时设置
API_TIMEOUT_MS=2000

# 缓存设置
WEATHER_CACHE_TTL_HOURS=6
ROAD_CACHE_TTL_HOURS=24

# PostGIS 配置
POSTGIS_SRID=4326
```

**生产环境安全建议**:
```bash
# 使用强密码
openssl rand -base64 32

# 限制 .env 文件权限
chmod 600 .env
```

---

### Step 3: 数据库迁移

#### 3.1 生成 Prisma Client

```bash
pnpm prisma:generate

# 或
npx prisma generate
```

#### 3.2 执行数据库迁移

```bash
# 检查迁移状态
pnpm prisma migrate status

# 执行迁移 (生产环境)
pnpm prisma migrate deploy

# 验证表结构
psql $DATABASE_URL -c "\dt"
```

**预期输出** (部分表):
```
 public | Place                      | table | tripnara_user
 public | RouteTemplate              | table | tripnara_user
 public | RoadStatusRealtime         | table | tripnara_user
 public | WeatherForecastRealtime    | table | tripnara_user
 public | geo_dem_iceland_20m        | table | tripnara_user
 public | DecisionLog                | table | tripnara_user
```

#### 3.3 验证 PostGIS 表

```bash
psql $DATABASE_URL <<EOF
-- 检查 RoadStatusRealtime 表
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'road_status_realtime';

-- 检查 WeatherForecastRealtime 表
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'weather_forecast_realtime';

-- 验证 PostGIS Geography 列
SELECT f_table_name, f_geography_column, coord_dimension, srid, type
FROM geography_columns
WHERE f_table_name IN ('weather_forecast_realtime', 'Place');
EOF
```

---

### Step 4: 初始数据导入

#### 4.1 导入冰岛 POI

```bash
# 导入核心 POI 和路线
npx tsx scripts/setup-iceland-core-pois-and-routes.ts

# 验证导入结果
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Place\" WHERE country = 'Iceland';"
# 预期: 1500+

psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"RouteTemplate\" WHERE region = 'Iceland';"
# 预期: 7
```

#### 4.2 导入 DEM 数据 (可选，如需爬升计算)

```bash
# 下载并导入 20m 精度 DEM
npx tsx scripts/import-iceland-dem-20m.ts

# 验证 DEM 数据
psql $DATABASE_URL -c "SELECT COUNT(*) FROM geo_dem_iceland_20m;"
```

#### 4.3 初始化天气数据

```bash
# 执行一次天气同步
npx tsx scripts/cron/sync-weather-daily.ts

# 验证天气数据
psql $DATABASE_URL -c "SELECT region_key, COUNT(*) FROM weather_forecast_realtime GROUP BY region_key;"
# 预期: 7 个区域各有数据
```

#### 4.4 初始化 F-Road 状态

```bash
# 执行一次 F-Road 同步
npx tsx scripts/sync-iceland-road-status.ts

# 验证 F-Road 数据
psql $DATABASE_URL -c "SELECT COUNT(*) FROM road_status_realtime;"
# 预期: 23 条 F-roads
```

---

### Step 5: 构建应用

#### 5.1 TypeScript 编译

```bash
# 类型检查
pnpm typecheck

# 构建
pnpm build
```

#### 5.2 验证构建产物

```bash
ls -lh dist/
# 应看到编译后的 .js 文件
```

---

### Step 6: 启动应用

#### 6.1 开发模式 (测试用)

```bash
pnpm dev
```

#### 6.2 生产模式

```bash
# 方式 1: 直接启动
pnpm start:prod

# 方式 2: 使用 PM2 (推荐)
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

#### 6.3 PM2 配置示例

创建 `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'tripnara-iceland',
    script: 'dist/main.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    max_memory_restart: '1G',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    watch: false,
    max_restarts: 10,
    min_uptime: '10s',
  }]
};
```

启动 PM2:
```bash
pm2 start ecosystem.config.js --env production
pm2 logs tripnara-iceland  # 查看日志
pm2 monit  # 监控面板
```

---

### Step 7: 配置 Nginx 反向代理 (可选)

#### 7.1 安装 Nginx

```bash
sudo apt-get install nginx
```

#### 7.2 配置反向代理

创建 `/etc/nginx/sites-available/tripnara`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }

    # 日志
    access_log /var/log/nginx/tripnara-access.log;
    error_log /var/log/nginx/tripnara-error.log;
}
```

启用配置:
```bash
sudo ln -s /etc/nginx/sites-available/tripnara /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### 7.3 配置 SSL (推荐)

```bash
# 使用 Let's Encrypt
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

### Step 8: 配置 Cron 任务验证

#### 8.1 验证 NestJS Cron 模块

检查 `src/app.module.ts` 包含:

```typescript
import { SyncWeatherCronModule } from './cron/sync-weather.cron';

@Module({
  imports: [
    // ... 其他模块
    SyncWeatherCronModule,
  ],
})
export class AppModule {}
```

#### 8.2 验证 Cron 任务执行

启动应用后，查看日志:

```bash
pm2 logs tripnara-iceland | grep "Cron"
```

预期输出:
```
[SyncWeatherCron] Cron job registered: 0 6,12,18 * * *
[SyncWeatherCron] Starting weather sync...
[SyncWeatherCron] Weather sync completed: 7 regions updated
```

#### 8.3 手动触发 Cron 任务

```bash
# 天气同步
npx tsx scripts/cron/sync-weather-daily.ts

# F-Road 同步
npx tsx scripts/sync-iceland-road-status.ts
```

---

### Step 9: 健康检查

#### 9.1 访问健康检查端点

```bash
curl http://localhost:3000/health
```

预期响应:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-14T18:45:00.000Z",
  "checks": {
    "database": "ok",
    "weather_data": "ok",
    "road_data": "ok"
  }
}
```

#### 9.2 验证核心功能

**测试 Gate 评估**:
```bash
curl -X POST http://localhost:3000/api/agent/evaluate-gate \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test-001",
    "origin": "Reykjavík, Iceland",
    "destination": "Landmannalaugar, F208, Iceland",
    "date_range": {
      "start": "2026-07-15T00:00:00Z",
      "end": "2026-07-18T00:00:00Z"
    }
  }'
```

预期: 返回 `GateResult` 包含 `gate_result`, `violations`, `adjustments`, `evidence_refs`

---

## 🔍 监控和维护

### 日志管理

#### 查看应用日志
```bash
# PM2 日志
pm2 logs tripnara-iceland

# 实时日志
tail -f logs/app.log

# 错误日志
tail -f logs/error.log

# Cron 日志
tail -f logs/cron-weather-sync.log
```

#### 日志轮转配置

创建 `/etc/logrotate.d/tripnara`:
```
/opt/tripnara/tripnaraht/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 tripnara tripnara
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

### 数据库维护

#### 定期清理旧数据

```sql
-- 清理 90 天前的天气数据
DELETE FROM weather_forecast_realtime
WHERE created_at < NOW() - INTERVAL '90 days';

-- 清理 90 天前的 F-Road 数据
DELETE FROM road_status_realtime
WHERE last_verified_at < NOW() - INTERVAL '90 days';

-- 清理 90 天前的决策日志
DELETE FROM "DecisionLog"
WHERE timestamp < NOW() - INTERVAL '90 days';
```

#### 数据库备份

```bash
# 每日备份脚本
#!/bin/bash
BACKUP_DIR="/backup/tripnara"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/tripnara_$DATE.sql.gz"

# 创建备份
pg_dump $DATABASE_URL | gzip > $BACKUP_FILE

# 保留最近 7 天备份
find $BACKUP_DIR -name "tripnara_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
```

添加到 crontab:
```bash
# 每天凌晨 2 点执行备份
0 2 * * * /opt/tripnara/scripts/backup-db.sh >> /var/log/tripnara-backup.log 2>&1
```

### 性能监控

#### 数据库性能

```sql
-- 查看慢查询
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
WHERE mean_time > 100
ORDER BY mean_time DESC
LIMIT 10;

-- 查看表大小
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 查看索引使用情况
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;
```

#### 应用性能

```bash
# PM2 监控
pm2 monit

# 内存使用
pm2 show tripnara-iceland | grep "memory"

# CPU 使用
pm2 show tripnara-iceland | grep "cpu"
```

---

## 🚨 故障排查

### 常见问题

#### 1. 数据库连接失败

**错误**: `Error: connect ECONNREFUSED`

**解决**:
```bash
# 检查 PostgreSQL 服务
sudo systemctl status postgresql

# 检查连接字符串
echo $DATABASE_URL

# 测试连接
psql $DATABASE_URL -c "SELECT 1"
```

#### 2. PostGIS 扩展缺失

**错误**: `ERROR: type "geography" does not exist`

**解决**:
```sql
-- 连接到数据库
psql $DATABASE_URL

-- 启用 PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- 验证
SELECT PostGIS_Version();
```

#### 3. Cron 任务未执行

**检查**:
```bash
# 查看日志
pm2 logs | grep "Cron"

# 验证 Cron 模块已注册
grep "SyncWeatherCronModule" src/app.module.ts
```

**解决**:
```typescript
// 确保 src/app.module.ts 包含:
import { ScheduleModule } from '@nestjs/schedule';
import { SyncWeatherCronModule } from './cron/sync-weather.cron';

@Module({
  imports: [
    ScheduleModule.forRoot(),  // 必需
    SyncWeatherCronModule,
    // ...
  ],
})
```

#### 4. 天气数据过期

**检查**:
```sql
SELECT
  region_key,
  MAX(created_at) as last_update,
  NOW() - MAX(created_at) as age
FROM weather_forecast_realtime
GROUP BY region_key;
```

**解决**:
```bash
# 手动触发同步
npx tsx scripts/cron/sync-weather-daily.ts

# 检查 Cron 日志
tail -f logs/cron-weather-sync.log
```

#### 5. F-Road API 失败

**错误**: `getaddrinfo ENOTFOUND api.road.is`

**解决**: 自动降级到静态数据源，无需处理

**验证降级**:
```bash
# 查看日志应看到:
# [RoadStatusRealtimeService] 降级到静态数据源
# [RoadStatusRealtimeService] 使用静态数据源获取 F208 状态
```

---

## 🔒 安全建议

### 环境变量安全

```bash
# 使用强密码
DATABASE_URL="postgresql://user:$(openssl rand -base64 32)@..."

# 限制文件权限
chmod 600 .env
chown tripnara:tripnara .env
```

### 数据库安全

```sql
-- 限制用户权限
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO tripnara_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tripnara_user;

-- 启用行级安全 (可选)
ALTER TABLE "DecisionLog" ENABLE ROW LEVEL SECURITY;
```

### 网络安全

```nginx
# Nginx 配置
# 限制请求大小
client_max_body_size 10M;

# 速率限制
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req zone=api_limit burst=20 nodelay;

# 隐藏版本信息
server_tokens off;
```

---

## 📊 性能优化建议

### 数据库优化

```sql
-- 创建额外索引 (如需要)
CREATE INDEX idx_weather_region_time
ON weather_forecast_realtime (region_key, valid_from, valid_until);

CREATE INDEX idx_road_status_road
ON road_status_realtime (road_id, last_verified_at);

-- 更新统计信息
ANALYZE weather_forecast_realtime;
ANALYZE road_status_realtime;

-- 启用自动 VACUUM
ALTER TABLE weather_forecast_realtime SET (autovacuum_enabled = true);
```

### 应用优化

```typescript
// 启用压缩 (src/main.ts)
import compression from 'compression';
app.use(compression());

// 启用 CORS (如需要)
app.enableCors({
  origin: ['https://your-domain.com'],
  credentials: true,
});
```

---

## ✅ 部署检查清单

### 部署前

- [x] 环境变量已配置
- [x] 数据库已创建并启用 PostGIS
- [x] 依赖已安装 (`pnpm install`)
- [x] 代码已构建 (`pnpm build`)
- [x] 数据库迁移已执行 (`pnpm prisma migrate deploy`)
- [x] 初始数据已导入 (POI/DEM/天气/F-Road)
- [x] 类型检查通过 (`pnpm typecheck`)
- [x] E2E 测试通过

### 部署后

- [ ] 应用成功启动 (`pm2 status`)
- [ ] 健康检查通过 (`curl /health`)
- [ ] Cron 任务已执行 (查看日志)
- [ ] 天气数据已同步 (查询数据库)
- [ ] F-Road 数据已同步 (查询数据库)
- [ ] Gate 评估正常 (API 测试)
- [ ] 日志输出正常
- [ ] 监控指标上报 (如配置)

---

## 📞 支持和文档

### 相关文档
- [生产就绪检查清单](./PRODUCTION_READINESS_CHECKLIST.md)
- [Phase 4 完成报告](./PHASE_4_COMPLETION_REPORT.md)
- [Phase 5 完成报告](./PHASE_5_COMPLETION_REPORT.md)
- [最终验证报告](./FINAL_VERIFICATION_REPORT.md)

### 技术支持
- GitHub Issues: `https://github.com/your-org/tripnara/issues`
- 文档: `docs/iceland/`

---

**最后更新**: 2026-02-14
**版本**: v1.0 (Phase 1-5 完成版)

🎉 **部署完成！冰岛世界模型已成功投入生产环境！**
