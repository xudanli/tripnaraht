# Redis 接入指南

## 📋 概述

项目已接入 Redis 作为缓存层，主要用于：
- 缓存路线数据（RouteCache）
- 缓存 API 响应（Google Routes API 等）
- 提高系统性能和响应速度

## 🚀 安装和配置

### 1. 安装依赖

依赖已安装：
- `@nestjs/cache-manager` - NestJS 缓存管理器
- `cache-manager` - 缓存管理器核心
- `cache-manager-redis-store` - Redis 存储适配器
- `redis` - Redis 客户端
- `@types/cache-manager-redis-store` - TypeScript 类型定义

### 2. 环境变量配置

在 `.env` 文件中添加以下配置：

```env
# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # 可选，如果 Redis 设置了密码
REDIS_DB=0               # 数据库编号，默认 0
REDIS_TTL=3600           # 默认缓存过期时间（秒），默认 1 小时
```

### 3. 启动 Redis

#### 使用 Docker（推荐）

```bash
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:latest
```

#### 使用本地安装

```bash
# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis

# macOS
brew install redis
brew services start redis
```

## 📁 项目结构

```
src/
  redis/
    redis.module.ts      # Redis 模块配置
    redis.service.ts     # Redis 服务（统一缓存接口）
  transport/
    services/
      route-cache.service.ts  # 路线缓存服务（已集成 Redis）
```

## 🔧 使用方式

### 1. 在服务中注入 RedisService

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class YourService {
  constructor(private redisService: RedisService) {}

  async getData(key: string) {
    // 从缓存获取
    const cached = await this.redisService.get(key);
    if (cached) return cached;

    // 从数据库获取
    const data = await this.fetchFromDatabase();
    
    // 保存到缓存
    await this.redisService.set(key, data, 3600); // TTL: 1 小时
    
    return data;
  }
}
```

### 2. 路线缓存（已实现）

`RouteCacheService` 已集成 Redis，自动缓存路线数据：

```typescript
// 获取缓存
const cached = await routeCacheService.getCachedRoute(
  fromLat, fromLng,
  toLat, toLng,
  'TRANSIT'
);

// 保存缓存
await routeCacheService.saveCachedRoute(
  fromLat, fromLng,
  toLat, toLng,
  'TRANSIT',
  routeData
);
```

### 3. 生成缓存键

```typescript
// 使用 RedisService 生成标准化的缓存键
const key = redisService.generateKey('prefix', 'part1', 'part2', 123);
// 结果: "prefix:part1:part2:123"
```

## 📊 缓存策略

### 路线缓存（RouteCache）

- **缓存键格式**: `route:{fromLat},{fromLng}_{toLat},{toLng}_{travelMode}`
- **TTL**: 24 小时
- **精度**: 坐标四舍五入到小数点后 4 位（约 11 米精度）

### 其他缓存建议

- **API 响应**: TTL 根据数据更新频率设置（1-24 小时）
- **计算结果**: TTL 根据计算成本设置（1 小时 - 7 天）
- **用户会话**: TTL 根据业务需求设置（30 分钟 - 24 小时）

## 🔍 监控和调试

### 检查 Redis 连接

```bash
# 使用 redis-cli
redis-cli ping
# 应该返回: PONG
```

### 查看缓存键

```bash
# 列出所有键
redis-cli KEYS "*"

# 查看特定前缀的键
redis-cli KEYS "route:*"

# 查看键的 TTL
redis-cli TTL "route:35.1234,139.5678_35.2345,139.6789_TRANSIT"
```

### 清空缓存

```typescript
// 清空所有缓存
await redisService.reset();

// 删除特定键
await redisService.del('route:...');
```

## ⚠️ 注意事项

1. **Redis 连接失败**: 如果 Redis 不可用，系统会记录错误日志但继续运行（降级策略）
2. **内存管理**: 注意 Redis 内存使用，设置合适的 `maxmemory` 和淘汰策略
3. **缓存一致性**: 数据更新时需要清除相关缓存
4. **TTL 设置**: 根据数据特性设置合理的过期时间

## 🚀 性能优化

### 1. 批量操作

对于需要缓存多个键的场景，考虑使用 Redis Pipeline：

```typescript
// 未来可以扩展 RedisService 支持批量操作
async mget(keys: string[]): Promise<any[]>
async mset(keyValues: Map<string, any>, ttl?: number): Promise<void>
```

### 2. 缓存预热

在系统启动时，可以预加载热门路线到缓存：

```typescript
// 预加载热门路线
const popularRoutes = [
  { from: '成田机场', to: '新宿站' },
  { from: '羽田机场', to: '东京站' },
  // ...
];
```

### 3. 缓存穿透保护

对于不存在的键，可以设置短期的空值缓存，避免频繁查询：

```typescript
if (!data) {
  // 缓存空值 5 分钟，避免缓存穿透
  await redisService.set(key, null, 300);
}
```

## 📝 后续改进

1. **实现批量操作**: 支持 `mget`、`mset` 等批量操作
2. **添加缓存统计**: 记录缓存命中率、缓存大小等指标
3. **实现缓存预热**: 系统启动时预加载热门数据
4. **添加缓存监控**: 集成监控工具，实时查看缓存状态
