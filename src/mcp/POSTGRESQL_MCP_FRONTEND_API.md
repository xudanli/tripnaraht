# PostgreSQL MCP 前端 API 文档

**服务名称**: PostgreSQL MCP Server  
**Base URL**: `/api/postgresql-mcp`  
**服务 URL**: `https://server.smithery.ai/1Levick3/postgresql-mcp-server`  
**认证**: 当前无需认证（生产环境可能需要）

---

## 📋 目录

1. [快速开始](#快速开始)
2. [API 端点](#api-端点)
   - [基础端点](#基础端点)
   - [监控端点](#监控端点)
3. [数据模型](#数据模型)
4. [错误处理](#错误处理)
5. [使用示例](#使用示例)
6. [安全特性](#安全特性)
7. [注意事项](#注意事项)

---

## 🚀 快速开始

### 1. 检查服务状态

```bash
curl http://localhost:3000/api/postgresql-mcp/health
```

**响应**:
```json
{
  "success": true,
  "data": {
    "available": true,
    "service": "postgresql-mcp"
  }
}
```

### 2. 列出可用工具

```bash
curl http://localhost:3000/api/postgresql-mcp/tools
```

### 3. 执行 SQL 查询

```bash
curl -X POST http://localhost:3000/api/postgresql-mcp/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "SELECT version() as pg_version",
    "params": []
  }'
```

---

## 📡 API 端点

### 基础端点

#### 1. 检查服务状态

**端点**: `GET /api/postgresql-mcp/health`

**描述**: 检查 PostgreSQL MCP 服务是否可用

**响应**:
```typescript
interface HealthResponse {
  success: boolean;
  data: {
    available: boolean;
    service: string;
  };
}
```

---

#### 2. 列出所有可用工具

**端点**: `GET /api/postgresql-mcp/tools`

**描述**: 获取 PostgreSQL MCP 服务器提供的所有工具列表

**响应**:
```typescript
interface ToolsResponse {
  success: boolean;
  data: {
    tools: Array<{
      name: string;
      description?: string;
      inputSchema?: any;
    }>;
  };
}
```

**示例**:
```typescript
const listTools = async () => {
  const response = await fetch('/api/postgresql-mcp/tools');
  const result = await response.json();
  if (result.success) {
    return result.data.tools;
  } else {
    throw new Error(result.error?.message || '获取工具列表失败');
  }
};
```

---

#### 3. 执行 SQL 查询

**端点**: `POST /api/postgresql-mcp/query`

**描述**: 执行 SELECT 查询并返回结果

**请求体**:
```typescript
interface QueryDto {
  query: string;        // SQL 查询语句（SELECT）
  params?: any[];      // 查询参数（可选）
}
```

**响应**:
```typescript
interface QueryResponse {
  success: boolean;
  data: {
    rows: any[];           // 查询结果行
    rowCount: number;      // 行数
    columns?: string[];    // 列名（可选）
  };
}
```

**示例**:
```typescript
const query = async (sql: string, params?: any[]) => {
  const response = await fetch('/api/postgresql-mcp/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, params }),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error?.message || '查询失败');
  }
};

// 使用
const result = await query('SELECT * FROM users WHERE id = $1', [1]);
console.log(`找到 ${result.rowCount} 行`);
result.rows.forEach(row => console.log(row));
```

---

#### 4. 执行 SQL 命令

**端点**: `POST /api/postgresql-mcp/execute`

**描述**: 执行 INSERT, UPDATE, DELETE 等命令

**请求体**:
```typescript
interface ExecuteDto {
  query: string;        // SQL 执行语句
  params?: any[];       // 执行参数（可选）
}
```

**响应**:
```typescript
interface ExecuteResponse {
  success: boolean;
  data: {
    rowCount: number;        // 影响的行数
    lastInsertId?: string;   // 最后插入的 ID（如果有）
  };
}
```

**示例**:
```typescript
const execute = async (sql: string, params?: any[]) => {
  const response = await fetch('/api/postgresql-mcp/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql, params }),
  });
  
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error?.message || '执行失败');
  }
};

// 使用
const result = await execute(
  'INSERT INTO users (name, email) VALUES ($1, $2)',
  ['John Doe', 'john@example.com']
);
console.log(`插入了 ${result.rowCount} 行`);
```

---

### 监控端点

#### 5. 获取性能统计

**端点**: `GET /api/postgresql-mcp/monitoring/stats`

**描述**: 获取 PostgreSQL MCP 查询的性能统计信息

**查询参数**:
```typescript
interface StatsQueryParams {
  days?: number;  // 统计天数（1-30，默认 1）
}
```

**响应**:
```typescript
interface PerformanceStatsResponse {
  success: boolean;
  data: {
    totalQueries: number;          // 总查询数
    avgExecutionTime: number;      // 平均执行时间（毫秒）
    p50ExecutionTime: number;      // P50 执行时间（毫秒）
    p95ExecutionTime: number;      // P95 执行时间（毫秒）
    p99ExecutionTime: number;      // P99 执行时间（毫秒）
    errorRate: number;             // 错误率（0-1）
    slowQueries: QueryMetrics[];    // 慢查询列表
  };
}

interface QueryMetrics {
  query: string;                    // SQL 查询语句
  params?: any[];                   // 查询参数
  executionTime: number;            // 执行时间（毫秒）
  timestamp: Date;                  // 执行时间戳
  success: boolean;                 // 是否成功
  error?: string;                   // 错误信息（如果有）
  rowCount?: number;                // 返回行数
}
```

**示例**:
```bash
# 获取最近 7 天的性能统计
curl "http://localhost:3000/api/postgresql-mcp/monitoring/stats?days=7"
```

**TypeScript 示例**:
```typescript
const getPerformanceStats = async (days: number = 1) => {
  const response = await fetch(`/api/postgresql-mcp/monitoring/stats?days=${days}`);
  const result = await response.json();
  if (result.success) {
    return result.data;
  } else {
    throw new Error(result.error?.message || '获取性能统计失败');
  }
};

// 使用
const stats = await getPerformanceStats(7);
console.log(`总查询数: ${stats.totalQueries}`);
console.log(`平均执行时间: ${stats.avgExecutionTime}ms`);
console.log(`P95 执行时间: ${stats.p95ExecutionTime}ms`);
console.log(`错误率: ${(stats.errorRate * 100).toFixed(2)}%`);
```

---

#### 6. 获取慢查询列表

**端点**: `GET /api/postgresql-mcp/monitoring/slow-queries`

**描述**: 获取执行时间超过阈值（1秒）的慢查询列表

**查询参数**:
```typescript
interface SlowQueriesQueryParams {
  limit?: number;  // 返回数量限制（1-100，默认 20）
}
```

**响应**:
```typescript
interface SlowQueriesResponse {
  success: boolean;
  data: {
    slowQueries: QueryMetrics[];  // 慢查询列表（按执行时间降序）
  };
}
```

**示例**:
```bash
# 获取最近 50 条慢查询
curl "http://localhost:3000/api/postgresql-mcp/monitoring/slow-queries?limit=50"
```

**TypeScript 示例**:
```typescript
const getSlowQueries = async (limit: number = 20) => {
  const response = await fetch(`/api/postgresql-mcp/monitoring/slow-queries?limit=${limit}`);
  const result = await response.json();
  if (result.success) {
    return result.data.slowQueries;
  } else {
    throw new Error(result.error?.message || '获取慢查询列表失败');
  }
};

// 使用
const slowQueries = await getSlowQueries(50);
slowQueries.forEach(query => {
  console.log(`慢查询 (${query.executionTime}ms):`);
  console.log(`  SQL: ${query.query.substring(0, 200)}...`);
  console.log(`  时间: ${query.timestamp}`);
  if (query.error) {
    console.log(`  错误: ${query.error}`);
  }
});
```

---

## 📊 数据模型

### QueryResult

```typescript
interface QueryResult {
  rows: any[];           // 查询结果行数组
  rowCount: number;      // 行数
  columns?: string[];    // 列名数组（可选）
}
```

### ExecuteResult

```typescript
interface ExecuteResult {
  rowCount: number;        // 影响的行数
  lastInsertId?: string;   // 最后插入的 ID（如果有）
}
```

---

## ⚠️ 错误处理

### 错误响应格式

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

### 常见错误

1. **服务不可用**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "PostgreSQL MCP service is not available. Please check POSTGRESQL_MCP_SERVER_URL configuration."
     }
   }
   ```

2. **SQL 语法错误**
   ```json
   {
     "success": false,
     "error": {
       "code": "INTERNAL_ERROR",
       "message": "PostgreSQL query failed: syntax error at or near..."
     }
   }
   ```

3. **参数错误**
   ```json
   {
     "success": false,
     "error": {
       "code": "BAD_REQUEST",
       "message": "Invalid request parameters"
     }
   }
   ```

---

## 💡 使用示例

### React Hook 示例

```typescript
import { useState } from 'react';

export const usePostgreSQLQuery = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeQuery = async (query: string, params?: any[]) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/postgresql-mcp/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, params }),
      });
      
      const result = await response.json();
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error?.message || '查询失败');
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { executeQuery, loading, error };
};
```

### 使用 Hook

```typescript
const DataComponent = () => {
  const { executeQuery, loading, error } = usePostgreSQLQuery();
  const [data, setData] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const result = await executeQuery('SELECT * FROM trips LIMIT 10');
      setData(result.rows);
    } catch (err) {
      console.error('加载数据失败:', err);
    }
  };

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;

  return (
    <div>
      <button onClick={loadData}>加载数据</button>
      <ul>
        {data.map((row, i) => (
          <li key={i}>{JSON.stringify(row)}</li>
        ))}
      </ul>
    </div>
  );
};
```

---

## 🔒 安全特性

### SQL 注入检测

所有查询在执行前都会经过 SQL 注入检测：

- ✅ **模式检测**: 检测 20+ 种 SQL 注入模式
- ✅ **危险操作检测**: 阻止 DROP、DELETE、TRUNCATE 等危险操作（除非有权限）
- ✅ **参数验证**: 验证参数数量与占位符匹配
- ✅ **查询长度检查**: 检测异常长的查询

**被阻止的查询示例**:
```typescript
// ❌ 会被阻止：SQL 注入模式
await query("SELECT * FROM users WHERE id = 1 OR 1=1");

// ❌ 会被阻止：危险操作（如果没有权限）
await execute("DROP TABLE users");

// ✅ 安全：参数化查询
await query("SELECT * FROM users WHERE id = $1", [userId]);
```

### 权限控制

系统支持基于角色的权限控制：

- **admin**: 所有操作（SELECT、INSERT、UPDATE、DELETE）
- **user**: 仅 SELECT 查询
- **readonly**: 仅 SELECT 查询（更严格的限制）

### 查询监控

- ✅ **自动记录**: 所有查询自动记录执行时间、成功/失败状态
- ✅ **慢查询追踪**: 执行时间超过 1 秒的查询会被单独记录
- ✅ **性能统计**: 提供平均、P50、P95、P99 执行时间统计

---

## ⚠️ 注意事项

### 1. 数据库连接配置

- **PostgreSQL MCP Server 需要配置数据库连接**
- 连接信息通常在服务器端配置，前端无需关心
- 确保 PostgreSQL MCP Server 可以访问目标数据库

### 2. SQL 注入防护

- **使用参数化查询**：始终使用 `$1, $2` 等参数占位符
- **不要拼接 SQL**：避免直接拼接用户输入到 SQL 语句中
- **系统自动检测**：系统会自动检测并阻止 SQL 注入尝试

**正确示例**:
```typescript
// ✅ 正确：使用参数化查询
await query('SELECT * FROM users WHERE id = $1', [userId]);

// ❌ 错误：直接拼接（会被系统阻止）
await query(`SELECT * FROM users WHERE id = ${userId}`);
```

### 3. 权限控制

- **只读查询**：建议使用 `query` 端点进行 SELECT 查询
- **写操作**：使用 `execute` 端点进行 INSERT/UPDATE/DELETE
- **生产环境**：应该添加认证和授权机制
- **角色权限**：根据用户角色限制可执行的操作类型

### 4. 性能考虑

- **查询优化**：使用索引、限制结果数量
- **连接池**：PostgreSQL MCP Server 应该使用连接池
- **缓存**：对于频繁查询的数据，考虑添加缓存层
- **监控慢查询**：定期检查慢查询列表，优化性能瓶颈
- **性能统计**：使用监控端点跟踪查询性能趋势

**性能优化示例**:
```typescript
// ✅ 优化：限制结果数量
await query('SELECT * FROM trips ORDER BY created_at DESC LIMIT 10');

// ✅ 优化：使用索引字段查询
await query('SELECT * FROM trips WHERE id = $1', [tripId]);

// ❌ 未优化：全表扫描
await query('SELECT * FROM trips WHERE name LIKE $1', [`%${search}%`]);
```

### 5. 错误处理

- **网络错误**：处理网络连接失败的情况
- **SQL 错误**：处理 SQL 语法错误和数据库错误
- **安全错误**：处理 SQL 注入检测失败的情况
- **超时**：设置合理的超时时间
- **监控错误率**：使用性能统计端点监控错误率

**错误处理示例**:
```typescript
try {
  const result = await query('SELECT * FROM trips WHERE id = $1', [tripId]);
  return result.rows;
} catch (error: any) {
  if (error.message.includes('SQL 查询被安全策略阻止')) {
    console.error('查询被安全策略阻止，请检查 SQL 语句');
  } else if (error.message.includes('PostgreSQL MCP service is not available')) {
    console.error('服务不可用，请检查配置');
  } else {
    console.error('查询失败:', error.message);
  }
  throw error;
}
```

### 6. 监控和调试

- **性能统计**：定期查看性能统计，了解查询性能趋势
- **慢查询分析**：分析慢查询列表，找出性能瓶颈
- **错误监控**：监控错误率，及时发现和解决问题

**监控示例**:
```typescript
// 获取性能统计
const stats = await getPerformanceStats(7);
if (stats.errorRate > 0.1) {
  console.warn(`错误率过高: ${(stats.errorRate * 100).toFixed(2)}%`);
}

// 分析慢查询
const slowQueries = await getSlowQueries(20);
if (slowQueries.length > 0) {
  console.warn(`发现 ${slowQueries.length} 个慢查询`);
  slowQueries.forEach(q => {
    console.log(`  - ${q.executionTime}ms: ${q.query.substring(0, 100)}...`);
  });
}
```

---

## 🔗 相关文档

- **测试文档**: `scripts/README-POSTGRESQL-MCP-TEST.md`
- **MCP 服务器文档**: https://smithery.ai/server/1Levick3/postgresql-mcp-server

---

---

## 📚 完整 API 端点列表

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/api/postgresql-mcp/health` | 检查服务状态 |
| GET | `/api/postgresql-mcp/tools` | 列出所有可用工具 |
| POST | `/api/postgresql-mcp/query` | 执行 SQL 查询（SELECT） |
| POST | `/api/postgresql-mcp/execute` | 执行 SQL 命令（INSERT/UPDATE/DELETE） |
| GET | `/api/postgresql-mcp/monitoring/stats` | 获取性能统计 |
| GET | `/api/postgresql-mcp/monitoring/slow-queries` | 获取慢查询列表 |

---

**最后更新**: 2026-02-06  
**版本**: 1.0.0  
**状态**: ✅ Phase 1-3 全部完成（基础设施、业务集成、优化监控）
