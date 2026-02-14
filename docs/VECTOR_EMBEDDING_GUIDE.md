# 向量化配置指南

## 当前状态

- **待向量化Chunks**: 19个
- **已向量化Chunks**: 23个
- **总Chunks**: 42个
- **向量化进度**: 54.8% (23/42)

---

## 问题诊断

### 当前问题
执行向量化时遇到网络连接问题：
- `ETIMEDOUT` - 连接超时
- `ECONNRESET` - 连接重置

### 根本原因
**直连OpenAI API在国内网络环境下不稳定**，可能遇到：
- DNS解析失败
- TLS握手超时
- 连接被重置

---

## 解决方案

### 方案1：使用代理（推荐）⭐

#### 1.1 配置代理环境变量

在 `.env` 文件中添加：

```bash
# OpenAI API配置
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1

# 代理配置（如果需要）
HTTP_PROXY=http://127.0.0.1:7890  # 替换为你的代理地址
HTTPS_PROXY=http://127.0.0.1:7890
```

#### 1.2 使用带代理的脚本

```bash
# 使用原始脚本（支持代理）
npx tsx scripts/update-embeddings.ts
```

**优点**：
- ✅ 稳定性高
- ✅ 速度快
- ✅ 成功率高

**缺点**：
- ⚠️ 需要配置代理工具（Clash、v2ray等）

---

### 方案2：使用中转API（稳定）⭐⭐

#### 2.1 配置中转服务

在 `.env` 文件中修改：

```bash
# 使用中转API（国内可访问）
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://api.openai-proxy.com/v1  # 示例，替换为实际中转地址
```

#### 2.2 执行向量化

```bash
# 使用直连脚本（不使用代理）
npx tsx scripts/update-embeddings-direct.ts
```

**优点**：
- ✅ 国内可直连
- ✅ 配置简单
- ✅ 不需要代理

**缺点**：
- ⚠️ 需要找到可靠的中转服务
- ⚠️ 可能有额外费用

**推荐中转服务**：
- openai-proxy.com
- api.openai-forward.com
- 自建中转（cloudflare workers）

---

### 方案3：使用国产Embedding模型（备选）

#### 3.1 配置本地Embedding服务

使用国产模型（如BAAI/bge-large-zh）：

```bash
# 安装依赖
pip install sentence-transformers

# 启动本地服务
python -m sentence_transformers.embedding_server \
  --model BAAI/bge-large-zh-v1.5 \
  --port 8080
```

#### 3.2 修改脚本使用本地服务

需要修改 `update-embeddings-direct.ts` 使用本地API。

**优点**：
- ✅ 不依赖外网
- ✅ 成本低
- ✅ 速度快

**缺点**：
- ⚠️ 需要修改代码
- ⚠️ 向量维度不同（需要修改数据库schema）
- ⚠️ 与OpenAI向量不兼容

---

### 方案4：分批手动执行（临时方案）

如果网络不稳定，可以分批执行：

```bash
# 创建分批脚本
cat > scripts/update-embeddings-batch.ts << 'EOF'
// 每次只处理5个chunks
const chunks = await prisma.$queryRaw`
  SELECT id, chunk_id, content
  FROM chunks
  WHERE embedding IS NULL
     OR embedding = (SELECT array_fill(0::real, ARRAY[1536]))::vector
  ORDER BY created_at ASC
  LIMIT 5  -- 每次只处理5个
`;
EOF
```

**执行方式**：
```bash
# 手动执行多次，直到全部完成
npx tsx scripts/update-embeddings-batch.ts
# 等待完成后再执行
npx tsx scripts/update-embeddings-batch.ts
# ...重复直到全部完成
```

---

## 推荐配置流程

### Step 1: 检查网络环境

```bash
# 测试OpenAI API连通性
curl -I https://api.openai.com/v1/models

# 如果失败，需要配置代理或使用中转
```

### Step 2: 选择合适方案

| 场景 | 推荐方案 | 优先级 |
|------|----------|--------|
| 有代理工具 | **方案1**（代理） | ⭐⭐⭐ |
| 无代理，找到中转 | **方案2**（中转API） | ⭐⭐⭐ |
| 完全离线 | **方案3**（国产模型） | ⭐⭐ |
| 临时应急 | **方案4**（分批执行） | ⭐ |

### Step 3: 配置环境变量

根据选择的方案配置 `.env` 文件。

### Step 4: 执行向量化

```bash
# 方案1/2：使用现有脚本
npx tsx scripts/update-embeddings-direct.ts

# 监控进度
tail -f /tmp/embedding-log.txt
```

### Step 5: 验证结果

```bash
# 验证向量化完成情况
npx tsx -e "
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verify() {
  const total = await prisma.chunk.count();
  const result = await prisma.\$queryRaw\`
    SELECT COUNT(*) as count
    FROM chunks
    WHERE embedding IS NULL
       OR embedding = (SELECT array_fill(0::real, ARRAY[1536]))::vector
  \`;

  const needCount = Number(result[0]?.count || 0);
  const hasEmbedding = total - needCount;

  console.log('向量化状态:');
  console.log(\`  总数: \${total}\`);
  console.log(\`  已完成: \${hasEmbedding} (\\${((hasEmbedding/total)*100).toFixed(1)}%)\`);
  console.log(\`  待完成: \${needCount}\`);

  await prisma.\$disconnect();
}

verify();
"
```

---

## 性能优化建议

### 1. 调整超时时间

根据网络环境调整超时：

```typescript
// 国内网络建议3-5分钟
timeout: 180000, // 3分钟

// 稳定环境可以缩短
timeout: 60000, // 1分钟
```

### 2. 调整重试策略

```typescript
// 增加重试次数和等待时间
const retries = 5;  // 重试5次
const waitTime = attempt * 20;  // 递增等待：20s, 40s, 60s...
```

### 3. 调整批量处理

```typescript
// 每N个请求休息一下
if ((i + 1) % 3 === 0) {  // 每3个请求休息
  await new Promise(resolve => setTimeout(resolve, 5000));  // 休息5秒
}
```

### 4. 使用更小的模型

如果成本敏感，可以使用更小的模型：

```typescript
model: 'text-embedding-3-small',  // 当前使用（1536维，$0.00002/1k tokens）
// 或
model: 'text-embedding-ada-002',  // 旧版（1536维，$0.0001/1k tokens）
```

---

## 成本估算

### OpenAI Embedding定价

| 模型 | 维度 | 价格 | 19个chunks成本 |
|------|------|------|----------------|
| text-embedding-3-small | 1536 | $0.00002/1k tokens | ~$0.0004 |
| text-embedding-3-large | 3072 | $0.00013/1k tokens | ~$0.0025 |
| text-embedding-ada-002 | 1536 | $0.0001/1k tokens | ~$0.002 |

**当前配置**：text-embedding-3-small
**预估成本**：~$0.0004 USD（约0.003元人民币）

---

## 常见问题

### Q1: 为什么会超时？
A: 国内访问OpenAI API可能被限制，建议使用代理或中转。

### Q2: 代理配置后仍然失败？
A: 检查代理是否支持HTTPS，端口是否正确。

### Q3: 可以使用免费的embedding服务吗？
A: 可以使用HuggingFace的免费API或自建模型服务，但需要修改代码。

### Q4: 向量维度可以改吗？
A: 可以，但需要修改数据库schema中的向量维度定义。

### Q5: 向量化失败会影响系统吗？
A: 不会影响基本功能，但RAG检索质量会下降（使用零向量无法进行语义搜索）。

---

## 下一步行动

### 立即行动（P0）

1. **配置网络环境**
   - 方案1：配置代理（推荐）
   - 方案2：找到可靠的中转服务

2. **执行向量化**
   ```bash
   npx tsx scripts/update-embeddings-direct.ts
   ```

3. **验证结果**
   ```bash
   # 检查向量化进度
   npx tsx scripts/check-kb-status.ts
   ```

### 优化行动（P1）

1. **优化检索质量**
   - 完成所有chunks的向量化
   - 测试RAG检索效果
   - 调整检索参数

2. **监控成本**
   - 记录API调用次数
   - 监控token消耗
   - 优化批量处理

---

## 相关脚本

| 脚本 | 用途 | 说明 |
|------|------|------|
| `update-embeddings.ts` | 带代理的向量化 | 支持HTTP_PROXY |
| `update-embeddings-direct.ts` | 直连的向量化 | 不使用代理 |
| `check-kb-status.ts` | 检查知识库状态 | 查看向量化进度 |

---

**最后更新**: 2026-01-24
**文档版本**: 1.0
**状态**: ✅ 配置指南完整
