# Redis 启动指南

## 📋 当前状态

✅ **应用可以在没有 Redis 的情况下运行**  
- Redis 连接失败时，系统会自动降级，不影响核心功能
- 缓存功能会失效，但 API 调用仍然正常工作
- 建议启动 Redis 以获得更好的性能和缓存功能

## 🚀 启动 Redis 的方法

### 方法 1: 使用 Docker（推荐，最简单）

```bash
# 启动 Redis 容器
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:latest

# 验证 Redis 运行
docker ps | grep redis

# 测试连接
docker exec -it redis redis-cli ping
# 应该返回: PONG
```

**停止 Redis**:
```bash
docker stop redis
docker rm redis
```

---

### 方法 2: 使用 apt 安装（Ubuntu/Debian）

```bash
# 安装 Redis
sudo apt-get update
sudo apt-get install -y redis-server

# 启动 Redis
sudo systemctl start redis
sudo systemctl enable redis  # 开机自启

# 验证
redis-cli ping
# 应该返回: PONG
```

**停止 Redis**:
```bash
sudo systemctl stop redis
```

---

### 方法 3: 从源码编译安装

```bash
# 下载 Redis
cd /tmp
wget https://download.redis.io/redis-stable.tar.gz
tar xzf redis-stable.tar.gz
cd redis-stable

# 编译
make

# 启动 Redis（前台运行，用于测试）
src/redis-server

# 或者后台运行
src/redis-server --daemonize yes
```

---

### 方法 4: 使用项目脚本

```bash
# 运行启动脚本（会自动检测并启动）
./scripts/start-redis.sh
```

---

## ✅ 验证 Redis 运行

### 1. 检查进程
```bash
pgrep -f redis-server
# 应该返回进程 ID
```

### 2. 检查端口
```bash
netstat -tlnp | grep 6379
# 或
ss -tlnp | grep 6379
```

### 3. 测试连接
```bash
redis-cli ping
# 应该返回: PONG
```

### 4. 查看 Redis 信息
```bash
redis-cli info server | grep -E "redis_version|uptime"
```

---

## 🔧 配置检查

确保 `.env` 文件中有以下配置（可选，有默认值）：

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # 如果 Redis 设置了密码
REDIS_DB=0
REDIS_TTL=3600           # 缓存过期时间（秒）
```

---

## 📊 应用集成状态

### Redis 在项目中的使用

1. **路线缓存** (`RouteCacheService`)
   - 缓存热门路线数据
   - 减少 API 调用次数
   - TTL: 24 小时

2. **API 响应缓存**
   - 缓存 Google Routes API 响应
   - 缓存高德地图 API 响应
   - 提高响应速度

### 降级机制

如果 Redis 不可用：
- ✅ 应用仍然正常运行
- ✅ API 调用正常工作
- ⚠️ 缓存功能失效（每次都会调用外部 API）
- ⚠️ 性能可能下降（无缓存）

---

## 🐛 常见问题

### 1. Redis 连接失败

**错误**: `Redis connection failed`

**解决方案**:
- 检查 Redis 是否运行: `pgrep -f redis-server`
- 检查端口是否监听: `netstat -tlnp | grep 6379`
- 检查防火墙设置
- 查看应用日志: `tail -f /tmp/nestjs.log | grep -i redis`

### 2. 端口被占用

**错误**: `EADDRINUSE: address already in use :::6379`

**解决方案**:
```bash
# 查找占用端口的进程
lsof -i :6379
# 或
netstat -tlnp | grep 6379

# 停止占用进程
kill <PID>
```

### 3. 权限问题

**错误**: `Permission denied`

**解决方案**:
```bash
# 使用 sudo 启动
sudo systemctl start redis

# 或使用 Docker（不需要 root 权限）
docker run -d --name redis -p 6379:6379 redis:latest
```

---

## 📝 快速启动命令

### 使用 Docker（推荐）
```bash
docker run -d --name redis -p 6379:6379 redis:latest && \
docker exec -it redis redis-cli ping
```

### 使用 systemctl
```bash
sudo systemctl start redis && \
redis-cli ping
```

---

## 🎯 下一步

1. ✅ 启动 Redis（选择上述任一方法）
2. ✅ 验证连接: `redis-cli ping`
3. ✅ 重启应用（如果正在运行）
4. ✅ 测试 API，查看日志确认 Redis 缓存工作正常

---

## 📚 相关文档

- `docs/REDIS-SETUP.md` - Redis 详细配置指南
- `docs/TRANSPORT-API-COMPLETE.md` - 交通规划 API 文档
- `scripts/start-redis.sh` - Redis 启动脚本
