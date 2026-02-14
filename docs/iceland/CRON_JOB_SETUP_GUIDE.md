# 生产环境 Cron Job 配置指南

## 方案选择

推荐使用 **NestJS @Cron 装饰器**（方案 1），因为：
- 集成在应用内，无需外部调度器
- 日志统一管理
- 易于监控和调试
- 支持动态启用/禁用

## 方案 1: NestJS Cron (推荐) ✅

### 步骤 1: 安装依赖

```bash
npm install @nestjs/schedule
```

### 步骤 2: 在 app.module.ts 中注册

```typescript
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncRoadStatusCron } from './cron/sync-road-status.cron';

@Module({
  imports: [
    ScheduleModule.forRoot(), // 启用 Cron 调度
    // ... 其他 imports
  ],
  providers: [
    SyncRoadStatusCron, // 注册 Cron Job
    // ... 其他 providers
  ],
})
export class AppModule {}
```

### 步骤 3: 验证配置

启动应用后查看日志：

```
[Nest] INFO  [SyncRoadStatusCron] Cron job 'sync-road-status-daily' registered
```

### 步骤 4: 手动测试 Cron Job

在控制器或测试文件中：

```typescript
import { SyncRoadStatusCron } from './cron/sync-road-status.cron';

// 手动触发一次
await cronService.handleDailySync();
```

### 步骤 5: 配置环境变量

在 `.env` 中：

```bash
# Cron Job 配置
CRON_ROAD_STATUS_ENABLED=true
CRON_ROAD_STATUS_SCHEDULE="0 6 * * *"  # 每天 6:00 UTC
CRON_ROAD_STATUS_TIMEZONE="UTC"
```

### 步骤 6: 动态配置（可选）

支持通过环境变量控制：

```typescript
@Cron(process.env.CRON_ROAD_STATUS_SCHEDULE || '0 6 * * *', {
  name: 'sync-road-status-daily',
  timeZone: process.env.CRON_ROAD_STATUS_TIMEZONE || 'UTC',
  disabled: process.env.CRON_ROAD_STATUS_ENABLED === 'false',
})
```

---

## 方案 2: 系统 Cron (Linux/Unix)

### 配置方式

```bash
# 编辑 crontab
crontab -e

# 添加定时任务
0 6 * * * cd /path/to/tripnara && npx tsx scripts/cron/sync-road-status-daily.ts >> /var/log/road-status-sync.log 2>&1
```

### 优点
- 独立于应用进程
- 系统级调度

### 缺点
- 日志分散
- 难以监控
- 需要额外配置环境变量

---

## 方案 3: GitHub Actions (如适用)

创建 `.github/workflows/sync-road-status.yml`:

```yaml
name: Sync Iceland Road Status

on:
  schedule:
    - cron: '0 6 * * *'  # 每天 6:00 UTC
  workflow_dispatch:      # 允许手动触发

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx tsx scripts/cron/sync-road-status-daily.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

### 优点
- 无需服务器资源
- 自动化日志

### 缺点
- 依赖 GitHub
- 网络延迟

---

## 监控与告警

### 1. 成功率监控

在 Cron Job 中添加指标收集：

```typescript
import { PrometheusService } from './prometheus.service';

@Injectable()
export class SyncRoadStatusCron {
  constructor(
    private readonly prometheus: PrometheusService,
  ) {}

  async handleDailySync() {
    const startTime = Date.now();
    try {
      const result = await this.syncAllRoads();

      // 记录成功指标
      this.prometheus.recordCronSuccess('road_status_sync', {
        api_success_rate: result.apiSuccess / this.F_ROADS.length,
        db_success_rate: result.dbSuccess / result.totalRecords,
      });
    } catch (error) {
      // 记录失败指标
      this.prometheus.recordCronFailure('road_status_sync', error);
    } finally {
      const duration = Date.now() - startTime;
      this.prometheus.recordCronDuration('road_status_sync', duration);
    }
  }
}
```

### 2. 失败告警

连续失败 3 次触发告警：

```typescript
private consecutiveFailures = 0;

async handleDailySync() {
  try {
    await this.syncAllRoads();
    this.consecutiveFailures = 0; // 重置计数
  } catch (error) {
    this.consecutiveFailures++;

    if (this.consecutiveFailures >= 3) {
      await this.sendAlert({
        severity: 'high',
        message: 'F-road 状态同步连续失败 3 次',
        error: error.message,
      });
    }

    throw error;
  }
}
```

### 3. 数据新鲜度监控

创建 Dashboard 查询：

```sql
-- 检查数据新鲜度
SELECT
  road_id,
  current_status,
  last_verified_at,
  EXTRACT(EPOCH FROM (NOW() - last_verified_at)) / 3600 AS hours_old
FROM road_status_realtime
WHERE last_verified_at = (
  SELECT MAX(last_verified_at)
  FROM road_status_realtime AS rsr
  WHERE rsr.road_id = road_status_realtime.road_id
)
ORDER BY last_verified_at DESC;
```

告警规则：
- ⚠️  Warning: 数据 > 24 小时
- 🚨 Critical: 数据 > 48 小时

---

## 测试验证

### 1. 本地测试

```bash
# 直接运行脚本
npx tsx scripts/cron/sync-road-status-daily.ts

# 预期输出
🚀 开始每日 F-road 状态同步...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第 1 步: 查询 road.is API
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
...
✅ 同步完成！
```

### 2. NestJS 测试

创建测试文件 `src/cron/sync-road-status.cron.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { SyncRoadStatusCron } from './sync-road-status.cron';
import { PrismaClient } from '@prisma/client';

describe('SyncRoadStatusCron', () => {
  let cron: SyncRoadStatusCron;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [SyncRoadStatusCron, PrismaClient],
    }).compile();

    cron = module.get(SyncRoadStatusCron);
  });

  it('should sync road statuses', async () => {
    await expect(cron.handleDailySync()).resolves.not.toThrow();
  });
});
```

### 3. 手动触发验证

在生产环境部署后，手动触发一次验证：

```bash
# 方法 1: 通过 NestJS 应用内部
curl -X POST http://localhost:3000/admin/cron/sync-road-status

# 方法 2: 直接运行脚本
NODE_ENV=production npx tsx scripts/cron/sync-road-status-daily.ts
```

---

## 回滚计划

如果 Cron Job 出现问题：

### 1. 临时禁用

```bash
# 环境变量方式
export CRON_ROAD_STATUS_ENABLED=false

# 或修改 crontab
crontab -e
# 注释掉相关行
```

### 2. 数据恢复

如果写入了错误数据：

```sql
-- 删除特定时间范围的数据
DELETE FROM road_status_realtime
WHERE created_at BETWEEN '2026-02-13 06:00:00' AND '2026-02-13 06:30:00';

-- 验证删除
SELECT COUNT(*) FROM road_status_realtime
WHERE created_at BETWEEN '2026-02-13 06:00:00' AND '2026-02-13 06:30:00';
```

### 3. 重新执行

```bash
# 手动执行一次补数据
npx tsx scripts/cron/sync-road-status-daily.ts
```

---

## 常见问题

### Q1: Cron Job 没有执行？

**检查清单**:
1. ScheduleModule 是否正确导入？
2. 环境变量 `CRON_ROAD_STATUS_ENABLED` 是否为 true？
3. 应用是否正常运行？
4. 查看日志是否有注册信息

### Q2: API 调用失败率高？

**可能原因**:
1. road.is API 不可用（使用降级方案）
2. 网络问题
3. 超时设置过短（当前 5 秒）

**解决方案**:
- 增加超时时间
- 增加重试逻辑
- 调整并发数

### Q3: 数据库写入失败？

**可能原因**:
1. 数据库连接池耗尽
2. 数据格式错误
3. 权限问题

**解决方案**:
- 检查 Prisma Client 连接
- 验证数据格式
- 查看数据库日志

---

## 部署检查清单

- [ ] ScheduleModule 已导入到 app.module.ts
- [ ] SyncRoadStatusCron 已添加到 providers
- [ ] 环境变量已配置（DATABASE_URL 等）
- [ ] 本地测试通过
- [ ] 日志输出正常
- [ ] 监控告警已配置
- [ ] 文档已更新

---

**最后更新**: 2026-02-13
**负责人**: 后端团队
**下次审查**: 运行 1 周后（2026-02-20）
