# PolicyService TypeScript 实现

## 📋 概述

PolicyService 的 TypeScript/Express 实现，替代了原来的 Python/FastAPI 版本。

## 🚀 快速开始

### 方式 1: 使用 ts-node 直接运行

```bash
cd scripts/rl-infra
ts-node policy-service.ts
```

或使用 npx:

```bash
cd scripts/rl-infra
npx ts-node policy-service.ts
```

### 方式 2: 使用启动脚本

```bash
cd scripts/rl-infra
./start-services.sh policy
```

### 方式 3: 编译后运行

```bash
cd scripts/rl-infra
tsc policy-service.ts --outDir dist --target ES2020 --module commonjs --esModuleInterop
node dist/policy-service.js
```

## ⚙️ 配置

通过环境变量配置：

```bash
POLICY_SERVICE_PORT=8002        # 服务端口（默认: 8002）
POLICY_SERVICE_HOST=0.0.0.0     # 监听地址（默认: 0.0.0.0）
```

## 📡 API 接口

### POST /predict
策略推理接口

```bash
curl -X POST http://localhost:8002/predict \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "req_001",
    "state": {
      "user_request": "Plan a trip to Iceland"
    },
    "model_version": "v1.0.0"
  }'
```

### GET /health
健康检查

```bash
curl http://localhost:8002/health
```

### GET /metrics
获取服务指标

```bash
curl http://localhost:8002/metrics
```

### POST /deploy
部署新模型

```bash
curl -X POST http://localhost:8002/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "model_version": "v1.1.0"
  }'
```

### POST /rollback
回滚模型

```bash
curl -X POST http://localhost:8002/rollback
```

## 🔄 从 Python 版本迁移

### 优势

1. **技术栈统一**: 与主项目使用相同的 TypeScript/Node.js 技术栈
2. **部署简单**: 无需 Python 环境和依赖管理
3. **性能**: Node.js 在 I/O 密集型场景下性能优秀
4. **类型安全**: TypeScript 提供完整的类型检查

### 兼容性

- ✅ **完全兼容**: API 接口与 Python 版本完全一致
- ✅ **无缝切换**: 无需修改调用代码
- ✅ **相同行为**: 业务逻辑保持一致

### 迁移步骤

1. **停止 Python 服务**:
   ```bash
   ./start-services.sh stop
   ```

2. **启动 TypeScript 服务**:
   ```bash
   ./start-services.sh policy
   ```

3. **验证服务**:
   ```bash
   curl http://localhost:8002/health
   ```

## 📦 依赖

需要以下依赖（已在主项目 package.json 中）:

- `express` - Web 框架
- `@types/express` - Express 类型定义
- `ts-node` - TypeScript 运行时（开发）
- `typescript` - TypeScript 编译器

如果主项目没有 express，需要安装：

```bash
npm install express
npm install --save-dev @types/express
```

## 🧪 测试

### 手动测试

```bash
# 1. 启动服务
ts-node policy-service.ts

# 2. 健康检查
curl http://localhost:8002/health

# 3. 策略推理
curl -X POST http://localhost:8002/predict \
  -H "Content-Type: application/json" \
  -d '{
    "request_id": "test_001",
    "state": {
      "user_request": "Plan a trip"
    }
  }'

# 4. 获取指标
curl http://localhost:8002/metrics
```

## 📝 文件结构

```
scripts/rl-infra/
├── policy-service.ts          # 主服务文件（TypeScript）
├── policy-service-types.ts    # 类型定义
├── policy_service.py          # Python 版本（保留作为参考）
└── README_POLICY_SERVICE_TS.md  # 本文档
```

## 🔧 开发

### 添加新功能

1. 在 `policy-service-types.ts` 中添加类型定义
2. 在 `policy-service.ts` 中实现业务逻辑
3. 添加相应的 API 端点

### 调试

使用 VS Code 或支持 TypeScript 的 IDE 可以直接调试。

或使用 `node --inspect`:

```bash
node --inspect -r ts-node/register policy-service.ts
```

## 📚 相关文档

- [API 规范](../POLICY_SERVICE_API_SPEC.md)
- [Python 版本参考](policy_service.py)
