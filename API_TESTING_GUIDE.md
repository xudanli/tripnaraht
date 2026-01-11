# API 接口测试指南

## 问题诊断

如果前端访问 API 返回 500 错误，需要逐步检查：

1. **应用容器是否运行**
2. **应用是否正常启动**
3. **端口是否正确监听**
4. **Nginx 配置是否正确**
5. **接口是否可访问**

## 快速测试脚本

项目提供了测试脚本 `scripts/test-api.sh`：

```bash
# 给脚本添加执行权限
chmod +x scripts/test-api.sh

# 运行测试
./scripts/test-api.sh
```

## 手动测试步骤

### 1. 检查容器状态

```bash
# 查看运行中的容器
docker ps | grep tripnara

# 查看所有容器（包括停止的）
docker ps -a | grep tripnara

# 查看容器日志
docker logs tripnara-app --tail 50
```

### 2. 测试容器内接口

```bash
# 在容器内测试
docker exec tripnara-app curl http://localhost:3000/api/system/status

# 或使用 wget
docker exec tripnara-app wget -qO- http://localhost:3000/api/system/status
```

### 3. 测试宿主机接口

```bash
# 测试健康检查接口
curl http://localhost:3000/api/system/status

# 测试认证接口
curl -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### 4. 检查端口监听

```bash
# 检查端口 3000 是否被监听
netstat -tlnp | grep 3000
# 或
ss -tlnp | grep 3000
# 或
lsof -i :3000
```

### 5. 检查 Nginx 配置

```bash
# 测试 nginx 配置
nginx -t

# 查看 nginx 错误日志
tail -f /var/log/nginx/tripnara-api-error.log

# 查看 nginx 访问日志
tail -f /var/log/nginx/tripnara-api-access.log

# 重新加载 nginx 配置
nginx -s reload
```

### 6. 测试通过 Nginx 代理

```bash
# 测试本地 nginx
curl http://localhost/api/system/status

# 测试外部访问（如果配置了域名）
curl https://api.tripnara.com/api/system/status
```

## 常见问题

### 问题 1: 容器未运行

**症状**: `docker ps | grep tripnara` 没有输出

**解决**:
```bash
# 检查容器状态
docker ps -a | grep tripnara

# 启动容器
docker start tripnara-app

# 或使用 docker-compose
docker compose up -d
```

### 问题 2: 应用未启动

**症状**: 容器运行但端口 3000 不可访问

**解决**:
```bash
# 查看容器日志
docker logs tripnara-app --tail 100

# 检查应用是否在监听
docker exec tripnara-app netstat -tlnp | grep 3000
```

### 问题 3: 端口映射问题

**症状**: 容器内可访问，宿主机不可访问

**解决**:
```bash
# 检查端口映射
docker port tripnara-app

# 应该显示: 3000/tcp -> 0.0.0.0:3000
```

### 问题 4: Nginx 配置错误

**症状**: 直接访问端口 3000 可以，通过 nginx 不行

**解决**:
```bash
# 检查 nginx 配置
cat /etc/nginx/sites-enabled/tripnara-api.conf
# 或
cat /etc/nginx/conf.d/tripnara-api.conf

# 确认 proxy_pass 指向正确的地址
# 应该是: proxy_pass http://127.0.0.1:3000;
```

### 问题 5: 接口路径问题

**后端配置**:
- 全局前缀: `/api` (在 `src/main.ts` 中设置)
- 认证接口: `/auth/email/send-code`
- 完整路径: `/api/auth/email/send-code`

**前端请求**:
- 应该请求: `/api/auth/email/send-code`
- 或配置代理: `/api` -> `https://api.tripnara.com/api`

## 接口路径说明

### 后端路径结构

```
/api                    # 全局前缀（在 main.ts 中设置）
  /auth                 # 认证模块
    /email/send-code    # 发送邮箱验证码
    /email/register     # 邮箱注册
    /email/login        # 邮箱登录
    /google/code        # Google OAuth (code)
    /google/id-token    # Google OAuth (id-token)
    /refresh            # 刷新 token
    /logout             # 登出
  /system/status        # 系统状态
  /trips                # 行程相关
  /places               # 地点相关
  ...
```

### Nginx 配置

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;  # 转发到后端
    # 前端请求 /api/auth/email/send-code
    # -> nginx 转发到 http://127.0.0.1:3000/api/auth/email/send-code
    # -> 后端处理 /api/auth/email/send-code
}
```

## 测试命令示例

### 测试健康检查

```bash
curl http://localhost:3000/api/system/status
```

### 测试发送验证码

```bash
curl -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### 测试 Google OAuth

```bash
curl -X POST http://localhost:3000/api/auth/google/code \
  -H "Content-Type: application/json" \
  -d '{"code":"test_code"}'
```

### 带详细输出的测试

```bash
curl -v -X POST http://localhost:3000/api/auth/email/send-code \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}' \
  2>&1 | tee /tmp/api-test.log
```

## 调试技巧

### 1. 查看实时日志

```bash
# 应用日志
docker logs -f tripnara-app

# Nginx 错误日志
tail -f /var/log/nginx/tripnara-api-error.log

# Nginx 访问日志
tail -f /var/log/nginx/tripnara-api-access.log
```

### 2. 进入容器调试

```bash
# 进入容器
docker exec -it tripnara-app sh

# 在容器内测试
curl http://localhost:3000/api/system/status

# 检查环境变量
env | grep DATABASE_URL
env | grep SMTP
```

### 3. 检查网络连接

```bash
# 从容器内测试数据库连接
docker exec tripnara-app sh -c 'echo $DATABASE_URL'

# 测试数据库连接（如果容器内有 psql）
docker exec tripnara-app psql "$DATABASE_URL" -c "SELECT 1;"
```

## 预期结果

### 成功响应示例

**健康检查**:
```json
{
  "status": "ok",
  "timestamp": "2026-01-11T07:00:00.000Z"
}
```

**发送验证码**:
```json
{
  "message": "验证码已发送，请查收邮件"
}
```

### 错误响应示例

**400 Bad Request**:
```json
{
  "statusCode": 400,
  "message": ["无效的邮箱地址"],
  "timestamp": "2026-01-11T07:00:00.000Z",
  "path": "/api/auth/email/send-code"
}
```

**500 Internal Server Error**:
```json
{
  "statusCode": 500,
  "message": ["Internal server error"],
  "timestamp": "2026-01-11T07:00:00.000Z",
  "path": "/api/auth/email/send-code"
}
```

## 下一步

如果测试发现问题：
1. 查看容器日志定位具体错误
2. 检查环境变量配置
3. 检查数据库连接
4. 检查 Nginx 配置
5. 根据错误信息修复问题
