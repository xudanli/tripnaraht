# Exa MCP 前端 API 文档

## 📋 概述

本文档说明如何在前端使用 Exa MCP 服务进行 Web 搜索、代码搜索和公司研究。

**Base URL**: `/api/exa`

**认证**: 当前所有接口均为公开接口（`@Public()`），生产环境可能需要添加认证。

**服务器**: 使用 Exa MCP 服务器 (`https://mcp.exa.ai/mcp`)，提供以下功能：
- ✅ Web 搜索 (`web_search_exa`)
- ✅ 代码上下文搜索 (`get_code_context_exa`)
- ✅ 公司研究 (`company_research_exa`)
- ✅ 高级 Web 搜索 (`web_search_advanced_exa`)
- ✅ 深度搜索 (`deep_search_exa`)
- ✅ 网页爬取 (`crawling_exa`)
- ✅ 人员搜索 (`people_search_exa`)
- ✅ 深度研究 (`deep_researcher_start`, `deep_researcher_check`)
- ✅ 监控和成本管理 (`monitoring/stats`, `monitoring/cost-check`) ⭐ 新增

**响应格式**: 所有接口统一使用以下响应格式：

```typescript
{
  success: boolean;
  data?: T;           // 成功时返回数据
  error?: {           // 失败时返回错误信息
    code: string;
    message: string;
    details?: Record<string, any>;
  }
}
```

**错误代码**:
- `BAD_REQUEST`: 请求参数错误
- `INTERNAL_ERROR`: 服务器内部错误

---

## 🎯 API 端点

**接口列表**:
1. [POST /exa/search/web - Web 搜索](#1-post-exasearchweb---web-搜索)
2. [POST /exa/search/code - 代码上下文搜索](#2-post-exasearchcode---代码上下文搜索)
3. [POST /exa/research/company - 公司研究](#3-post-exaresearchcompany---公司研究)
4. [POST /exa/crawl - 网页爬取](#4-post-exacrawl---网页爬取)
5. [POST /exa/deep-research/start - 启动深度研究](#5-post-exadeep-researchstart---启动深度研究)
6. [POST /exa/deep-research/check - 检查深度研究状态](#6-post-exadeep-researchcheck---检查深度研究状态)
7. [GET /exa/tools - 列出所有可用工具](#7-get-exatools---列出所有可用工具)
8. [GET /exa/status - 检查连接状态](#8-get-exastatus---检查连接状态)
9. [GET /exa/monitoring/stats - 获取使用统计](#9-get-examonitoringstats---获取使用统计) ⭐ 新增
10. [GET /exa/monitoring/cost-check - 检查成本限制](#10-get-examonitoringcost-check---检查成本限制) ⭐ 新增

---

### 1. POST /exa/search/web - Web 搜索

**用途**: 使用 Exa 进行 Web 搜索

**请求**:
```http
POST /api/exa/search/web
Content-Type: application/json

{
  "query": "latest AI developments",
  "numResults": 10,
  "useAutoprompt": true,
  "category": "article"
}
```

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| query | string | ✅ | 搜索查询 | `"latest AI developments"` |
| numResults | number | ❌ | 返回结果数量（默认: 10） | `10` |
| useAutoprompt | boolean | ❌ | 是否使用自动提示优化查询 | `true` |
| category | string | ❌ | 内容类别 | `"article"` |
| startPublishedDate | string | ❌ | 开始发布日期（ISO 8601） | `"2024-01-01"` |
| endPublishedDate | string | ❌ | 结束发布日期（ISO 8601） | `"2024-12-31"` |

**成功响应示例**:

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "title": "Latest AI Developments",
        "url": "https://example.com/article",
        "publishedDate": "2024-01-15",
        "author": "John Doe",
        "text": "Article content...",
        "score": 0.95
      }
    ],
    "autopromptString": "optimized query"
  }
}
```

---

### 2. POST /exa/search/code - 代码上下文搜索

**用途**: 搜索代码示例、文档和编程解决方案

**请求**:
```http
POST /api/exa/search/code
Content-Type: application/json

{
  "query": "React hooks useState example",
  "numResults": 5,
  "languages": ["javascript", "typescript"]
}
```

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| query | string | ✅ | 代码查询 | `"React hooks useState example"` |
| numResults | number | ❌ | 返回结果数量（默认: 5） | `5` |
| languages | string[] | ❌ | 编程语言列表 | `["javascript", "typescript"]` |

**成功响应示例**:

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "title": "React useState Hook Example",
        "url": "https://react.dev/reference/react/useState",
        "text": "const [state, setState] = useState(initialValue);",
        "language": "javascript",
        "score": 0.98
      }
    ]
  }
}
```

---

### 3. POST /exa/research/company - 公司研究

**用途**: 研究公司信息、新闻和洞察

**请求**:
```http
POST /api/exa/research/company
Content-Type: application/json

{
  "companyName": "OpenAI",
  "numResults": 10
}
```

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| companyName | string | ✅ | 公司名称 | `"OpenAI"` |
| numResults | number | ❌ | 返回结果数量（默认: 10） | `10` |

**成功响应示例**:

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "title": "OpenAI Announces New Model",
        "url": "https://example.com/news",
        "publishedDate": "2024-01-20",
        "text": "Company information...",
        "score": 0.92
      }
    ]
  }
}
```

---

### 4. POST /exa/crawl - 网页爬取

**用途**: 获取指定 URL 的完整内容

**请求**:
```http
POST /api/exa/crawl
Content-Type: application/json

{
  "url": "https://example.com/article",
  "text": true,
  "markdown": true
}
```

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| url | string | ✅ | 要爬取的 URL | `"https://example.com/article"` |
| text | boolean | ❌ | 是否返回文本内容 | `true` |
| html | boolean | ❌ | 是否返回 HTML 内容 | `false` |
| markdown | boolean | ❌ | 是否返回 Markdown 内容 | `true` |

**成功响应示例**:

```json
{
  "success": true,
  "data": {
    "url": "https://example.com/article",
    "title": "Article Title",
    "text": "Full article text...",
    "markdown": "# Article Title\n\nFull article markdown...",
    "html": "<html>...</html>"
  }
}
```

---

### 5. POST /exa/deep-research/start - 开始深度研究

**用途**: 启动 AI 研究代理，搜索、阅读并生成详细报告

**请求**:
```http
POST /api/exa/deep-research/start
Content-Type: application/json

{
  "query": "What are the latest developments in quantum computing?",
  "reportType": "research_report",
  "numResults": 20
}
```

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| query | string | ✅ | 研究查询 | `"What are the latest developments in quantum computing?"` |
| reportType | string | ❌ | 报告类型 | `"research_report"` |
| numResults | number | ❌ | 结果数量（默认: 20） | `20` |

**成功响应示例**:

```json
{
  "success": true,
  "data": {
    "taskId": "task-123",
    "status": "started",
    "message": "Research task started"
  }
}
```

---

### 6. POST /exa/deep-research/check - 检查深度研究状态

**用途**: 检查深度研究任务的状态并获取结果

**请求**:
```http
POST /api/exa/deep-research/check
Content-Type: application/json

{
  "taskId": "task-123"
}
```

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| taskId | string | ✅ | 任务 ID | `"task-123"` |

**成功响应示例**:

```json
{
  "success": true,
  "data": {
    "taskId": "task-123",
    "status": "completed",
    "report": "Detailed research report..."
  }
}
```

---

### 7. GET /exa/tools - 列出所有可用工具

**请求**:
```http
GET /api/exa/tools
```

**响应**:
```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "web_search_exa",
        "description": "Web 搜索工具"
      },
      {
        "name": "deep_search_exa",
        "description": "深度搜索工具"
      }
    ]
  }
}
```

---

### 8. GET /exa/status - 检查连接状态

**请求**:
```http
GET /api/exa/status
```

**响应**:
```json
{
  "success": true,
  "data": {
    "connected": true,
    "apiKeyConfigured": true,
    "serverUrl": "https://server.exa.ai"
  }
}
```

---

### 9. GET /exa/monitoring/stats - 获取使用统计 ⭐ 新增

**用途**: 获取 Exa API 的使用统计信息，包括每日统计、性能指标和成本估算

**请求**:
```http
GET /api/exa/monitoring/stats?days=7
```

**查询参数**:
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| days | number | ❌ | 查询最近 N 天的统计（默认 7） | `7` |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "dailyStats": [
      {
        "date": "2026-02-06",
        "totalCalls": 150,
        "successfulCalls": 145,
        "failedCalls": 5,
        "avgResponseTime": 1250,
        "callsByTool": {
          "web_search_exa": 100,
          "deep_search_exa": 30,
          "crawling_exa": 15,
          "deep_researcher_start": 3,
          "deep_researcher_check": 2
        },
        "estimatedCost": 0.185
      }
    ],
    "performance": {
      "avgResponseTime": 1250,
      "successRate": 0.967,
      "totalCalls": 150,
      "callsByTool": {
        "web_search_exa": 100,
        "deep_search_exa": 30,
        "crawling_exa": 15,
        "deep_researcher_start": 3,
        "deep_researcher_check": 2
      }
    },
    "totalCostEstimate": 0.185
  }
}
```

**响应字段说明**:
- `dailyStats`: 每日统计数组
  - `date`: 日期（YYYY-MM-DD）
  - `totalCalls`: 总调用次数
  - `successfulCalls`: 成功调用次数
  - `failedCalls`: 失败调用次数
  - `avgResponseTime`: 平均响应时间（毫秒）
  - `callsByTool`: 按工具分组的调用次数
  - `estimatedCost`: 估算成本（USD）
- `performance`: 性能指标汇总
  - `avgResponseTime`: 平均响应时间（毫秒）
  - `successRate`: 成功率（0-1）
  - `totalCalls`: 总调用次数
  - `callsByTool`: 按工具分组的调用次数
- `totalCostEstimate`: 总成本估算（USD，最近 N 天）

**前端使用示例**:
```typescript
// 获取最近 7 天的统计
const response = await fetch('/api/exa/monitoring/stats?days=7');
const data = await response.json();

if (data.success) {
  console.log('总调用次数:', data.data.performance.totalCalls);
  console.log('成功率:', (data.data.performance.successRate * 100).toFixed(2) + '%');
  console.log('平均响应时间:', data.data.performance.avgResponseTime + 'ms');
  console.log('总成本估算:', '$' + data.data.totalCostEstimate.toFixed(4));
  
  // 显示每日统计
  data.data.dailyStats.forEach(stat => {
    console.log(`${stat.date}: ${stat.totalCalls} 次调用, 成本 $${stat.estimatedCost.toFixed(4)}`);
  });
}
```

---

### 10. GET /exa/monitoring/cost-check - 检查成本限制 ⭐ 新增

**用途**: 检查今日 Exa API 调用成本是否超过限制

**请求**:
```http
GET /api/exa/monitoring/cost-check?dailyLimit=10
```

**查询参数**:
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| dailyLimit | number | ❌ | 每日成本限制（USD，默认 10） | `10` |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "exceeded": false,
    "currentCost": 0.185,
    "limit": 10
  }
}
```

**响应字段说明**:
- `exceeded`: 是否超过限制
- `currentCost`: 当前成本（USD，今日）
- `limit`: 成本限制（USD）

**前端使用示例**:
```typescript
// 检查成本限制（默认限制 $10）
const response = await fetch('/api/exa/monitoring/cost-check?dailyLimit=10');
const data = await response.json();

if (data.success) {
  const { exceeded, currentCost, limit } = data.data;
  
  if (exceeded) {
    console.warn(`⚠️ 成本超过限制: $${currentCost.toFixed(4)} / $${limit}`);
    // 显示告警
  } else {
    console.log(`✅ 成本正常: $${currentCost.toFixed(4)} / $${limit}`);
  }
}
```

**TypeScript 类型定义**:
```typescript
export interface ExaMonitoringStatsResponse {
  success: boolean;
  data: {
    dailyStats: Array<{
      date: string;
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      avgResponseTime: number;
      callsByTool: Record<string, number>;
      estimatedCost: number;
    }>;
    performance: {
      avgResponseTime: number;
      successRate: number;
      totalCalls: number;
      callsByTool: Record<string, number>;
    };
    totalCostEstimate: number;
  };
}

export interface ExaCostCheckResponse {
  success: boolean;
  data: {
    exceeded: boolean;
    currentCost: number;
    limit: number;
  };
}
```

---

### 8. GET /exa/status - 检查连接状态

**用途**: 检查 Exa MCP 连接状态和 API Key 配置

**请求**:
```http
GET /api/exa/status
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "isConnected": true,
    "hasApiKey": true
  }
}
```

---

## 💻 前端使用示例

### TypeScript/React 示例

```typescript
// api/exa.ts
const API_BASE_URL = '/api/exa';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export interface WebSearchParams {
  query: string;
  numResults?: number;
  useAutoprompt?: boolean;
  category?: string;
  startPublishedDate?: string;
  endPublishedDate?: string;
}

export interface CodeContextParams {
  query: string;
  numResults?: number;
  languages?: string[];
}

export interface CompanyResearchParams {
  companyName: string;
  numResults?: number;
}

export async function webSearch(params: WebSearchParams) {
  const response = await fetch(`${API_BASE_URL}/search/web`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data: ApiResponse<any> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '搜索失败');
  }

  return data.data;
}

export async function getCodeContext(params: CodeContextParams) {
  const response = await fetch(`${API_BASE_URL}/search/code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data: ApiResponse<any> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '代码搜索失败');
  }

  return data.data;
}

export async function companyResearch(params: CompanyResearchParams) {
  const response = await fetch(`${API_BASE_URL}/research/company`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data: ApiResponse<any> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '公司研究失败');
  }

  return data.data;
}

export async function crawlUrl(url: string, options?: {
  text?: boolean;
  html?: boolean;
  markdown?: boolean;
}) {
  const response = await fetch(`${API_BASE_URL}/crawl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, ...options }),
  });

  const data: ApiResponse<any> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '网页爬取失败');
  }

  return data.data;
}

export async function checkStatus() {
  const response = await fetch(`${API_BASE_URL}/status`);
  const data: ApiResponse<{
    isConnected: boolean;
    hasApiKey: boolean;
  }> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '检查状态失败');
  }

  return data.data;
}
```

### React Hook 示例

```typescript
// hooks/useExaSearch.ts
import { useState, useCallback } from 'react';
import { webSearch, WebSearchParams } from '../api/exa';

export function useExaSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any | null>(null);

  const search = useCallback(async (params: WebSearchParams) => {
    setLoading(true);
    setError(null);

    try {
      const data = await webSearch(params);
      setResults(data);
    } catch (err: any) {
      setError(err.message || '搜索失败');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    search,
    loading,
    error,
    results,
  };
}
```

---

### 9. GET /exa/monitoring/stats - 获取使用统计 ⭐ 新增

**用途**: 获取 Exa API 的使用统计信息，包括每日统计、性能指标和成本估算

**请求**:
```http
GET /api/exa/monitoring/stats?days=7
```

**查询参数**:
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| days | number | ❌ | 查询最近 N 天的统计（默认 7） | `7` |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "dailyStats": [
      {
        "date": "2026-02-06",
        "totalCalls": 150,
        "successfulCalls": 145,
        "failedCalls": 5,
        "avgResponseTime": 1250,
        "callsByTool": {
          "web_search_exa": 100,
          "deep_search_exa": 30,
          "crawling_exa": 15,
          "deep_researcher_start": 3,
          "deep_researcher_check": 2
        },
        "estimatedCost": 0.185
      }
    ],
    "performance": {
      "avgResponseTime": 1250,
      "successRate": 0.967,
      "totalCalls": 150,
      "callsByTool": {
        "web_search_exa": 100,
        "deep_search_exa": 30,
        "crawling_exa": 15,
        "deep_researcher_start": 3,
        "deep_researcher_check": 2
      }
    },
    "totalCostEstimate": 0.185
  }
}
```

**响应字段说明**:
- `dailyStats`: 每日统计数组
  - `date`: 日期（YYYY-MM-DD）
  - `totalCalls`: 总调用次数
  - `successfulCalls`: 成功调用次数
  - `failedCalls`: 失败调用次数
  - `avgResponseTime`: 平均响应时间（毫秒）
  - `callsByTool`: 按工具分组的调用次数
  - `estimatedCost`: 估算成本（USD）
- `performance`: 性能指标汇总
  - `avgResponseTime`: 平均响应时间（毫秒）
  - `successRate`: 成功率（0-1）
  - `totalCalls`: 总调用次数
  - `callsByTool`: 按工具分组的调用次数
- `totalCostEstimate`: 总成本估算（USD，最近 N 天）

**前端使用示例**:
```typescript
// 获取最近 7 天的统计
const response = await fetch('/api/exa/monitoring/stats?days=7');
const data = await response.json();

if (data.success) {
  console.log('总调用次数:', data.data.performance.totalCalls);
  console.log('成功率:', (data.data.performance.successRate * 100).toFixed(2) + '%');
  console.log('平均响应时间:', data.data.performance.avgResponseTime + 'ms');
  console.log('总成本估算:', '$' + data.data.totalCostEstimate.toFixed(4));
  
  // 显示每日统计
  data.data.dailyStats.forEach(stat => {
    console.log(`${stat.date}: ${stat.totalCalls} 次调用, 成本 $${stat.estimatedCost.toFixed(4)}`);
  });
}
```

---

### 10. GET /exa/monitoring/cost-check - 检查成本限制 ⭐ 新增

**用途**: 检查今日 Exa API 调用成本是否超过限制

**请求**:
```http
GET /api/exa/monitoring/cost-check?dailyLimit=10
```

**查询参数**:
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| dailyLimit | number | ❌ | 每日成本限制（USD，默认 10） | `10` |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "exceeded": false,
    "currentCost": 0.185,
    "limit": 10
  }
}
```

**响应字段说明**:
- `exceeded`: 是否超过限制
- `currentCost`: 当前成本（USD，今日）
- `limit`: 成本限制（USD）

**前端使用示例**:
```typescript
// 检查成本限制（默认限制 $10）
const response = await fetch('/api/exa/monitoring/cost-check?dailyLimit=10');
const data = await response.json();

if (data.success) {
  const { exceeded, currentCost, limit } = data.data;
  
  if (exceeded) {
    console.warn(`⚠️ 成本超过限制: $${currentCost.toFixed(4)} / $${limit}`);
    // 显示告警
  } else {
    console.log(`✅ 成本正常: $${currentCost.toFixed(4)} / $${limit}`);
  }
}
```

**TypeScript 类型定义**:
```typescript
export interface ExaMonitoringStatsResponse {
  success: boolean;
  data: {
    dailyStats: Array<{
      date: string;
      totalCalls: number;
      successfulCalls: number;
      failedCalls: number;
      avgResponseTime: number;
      callsByTool: Record<string, number>;
      estimatedCost: number;
    }>;
    performance: {
      avgResponseTime: number;
      successRate: number;
      totalCalls: number;
      callsByTool: Record<string, number>;
    };
    totalCostEstimate: number;
  };
}

export interface ExaCostCheckResponse {
  success: boolean;
  data: {
    exceeded: boolean;
    currentCost: number;
    limit: number;
  };
}
```

---

## ⚠️ 注意事项

### 1. API Key 配置
- **后端需要设置 `EXA_API_KEY` 环境变量**
- 获取 API Key: https://dashboard.exa.ai/api-keys
- 前端无需关心 API Key，由后端统一管理

### 2. 搜索限制
- **结果数量**: 建议设置合理的 `numResults`（例如 5-20）以提高响应速度
- **查询优化**: 使用 `useAutoprompt: true` 可以自动优化查询以获得更好的结果

### 3. 深度研究
- **异步任务**: `deep_researcher_start` 返回任务 ID，需要使用 `deep_researcher_check` 轮询检查状态
- **轮询间隔**: 建议每 5-10 秒检查一次状态

### 4. 网页爬取
- **内容格式**: 可以选择返回文本、HTML 或 Markdown 格式
- **URL 验证**: 确保 URL 格式正确且可访问

### 5. 错误处理
- **API Key 未设置**: 返回 `hasApiKey: false`，需要配置 `EXA_API_KEY`
- **连接失败**: 检查网络连接和服务器状态
- **参数验证**: 确保必填参数已提供且格式正确

### 6. 监控和成本管理 ⭐ 新增
- **成本估算**: 基于 Exa API 定价估算每次调用成本
  - `web_search_exa`: 约 $0.001/次
  - `deep_search_exa`: 约 $0.002/次
  - `crawling_exa`: 约 $0.0005/次
  - `deep_researcher_start`: 约 $0.005/次
  - `deep_researcher_check`: 约 $0.0001/次
- **监控最佳实践**:
  - 定期检查成本限制（建议每日）
  - 监控性能指标（成功率、响应时间）
  - 按工具分析使用情况，优化调用策略

---

## 📚 相关文档

- [Exa MCP 文档](https://docs.exa.ai/reference/exa-mcp)
- [Exa API 文档](https://docs.exa.ai/)
- [获取 Exa API Key](https://dashboard.exa.ai/api-keys)

---

**状态**: ✅ 已实现并测试通过

**最后更新**: 2026-02-06  
**更新内容**: 
- ✅ 新增监控端点：`GET /exa/monitoring/stats` 和 `GET /exa/monitoring/cost-check`
- ✅ 添加成本管理和监控最佳实践说明
