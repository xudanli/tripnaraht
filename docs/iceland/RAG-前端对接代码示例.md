# RAG 前端对接代码示例

**最后更新**: 2026-01-23  
**适用框架**: React + TypeScript  
**Base URL**: `http://localhost:3000/api/rag`

---

## 📋 目录

- [类型定义](#类型定义)
- [API 客户端封装](#api-客户端封装)
- [React Hooks](#react-hooks)
- [使用示例](#使用示例)

---

## 🔷 类型定义

### `src/types/rag.ts`

```typescript
// RAG 相关类型定义

// 文档检索请求
export interface ChunkRetrieveRequest {
  query: string;
  limit?: number;
  credibilityMin?: number;
  type?: string;
  category?: string;
  fileId?: string;
}

// 文档检索响应
export interface ChunkRetrieveResponse {
  id: string;
  chunkId: string;
  content: string;
  type: string;
  credibilityScore: number;
  keywords: string[];
  metadata?: Record<string, any>;
  fileId: string;
  similarity: number;
  sourceFile: string;
}

// 路线叙事请求
export interface RouteNarrativeRequest {
  routeDirectionId: string;
  countryCode?: string;
  includeLocalInsights?: boolean;
}

// 路线叙事响应
export interface RouteNarrativeResponse {
  narrative: {
    route: string;
    description: string;
    highlights: string[];
    tips: string[];
  };
  localInsights?: any[];
}

// 当地洞察请求
export interface LocalInsightRequest {
  countryCode: string;
  tags: string | string[];
  region?: string;
}

// 当地洞察响应
export interface LocalInsight {
  content: string;
  tags: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source?: string;
}

// 合规规则请求
export interface ComplianceRulesRequest {
  tripId: string;
  countryCodes: string[];
  ruleTypes?: string[];
}

// 合规规则响应
export interface ComplianceRule {
  category: string;
  items: Array<{
    description: string;
    required: boolean;
    deadline?: string;
    source: string;
  }>;
}

// 标准 API 响应
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// 文档列表请求
export interface DocumentListRequest {
  collection?: string;
  countryCode?: string;
  tags?: string;
  page?: number;
  pageSize?: number;
  search?: string;
}

// 文档列表响应
export interface DocumentListResponse {
  documents: Array<{
    id: string;
    title: string;
    contentPreview: string;
    collection: string;
    countryCode?: string;
    tags: string[];
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}
```

---

## 🔧 API 客户端封装

### `src/services/ragApi.ts`

```typescript
import axios, { AxiosInstance } from 'axios';
import type {
  ChunkRetrieveRequest,
  ChunkRetrieveResponse,
  RouteNarrativeRequest,
  RouteNarrativeResponse,
  LocalInsightRequest,
  LocalInsight,
  ComplianceRulesRequest,
  ComplianceRule,
  ApiResponse,
  DocumentListRequest,
  DocumentListResponse,
} from '@/types/rag';

class RagApiClient {
  private client: AxiosInstance;

  constructor(baseURL: string = '/api/rag') {
    this.client = axios.create({
      baseURL,
      timeout: 30000, // 30秒超时
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器：添加认证token（如果需要）
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('auth_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // 响应拦截器：统一错误处理
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        // 统一错误处理
        if (error.response) {
          const { status, data } = error.response;
          console.error(`API Error [${status}]:`, data);
        } else if (error.request) {
          console.error('Network Error:', error.message);
        } else {
          console.error('Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * 检索相关文档
   */
  async retrieveChunks(
    params: ChunkRetrieveRequest
  ): Promise<ChunkRetrieveResponse[]> {
    const response = await this.client.post<ApiResponse<ChunkRetrieveResponse[]>>(
      '/chunks/retrieve',
      params
    );
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || '检索失败');
    }
    
    return response.data.data || [];
  }

  /**
   * 获取路线叙事
   */
  async getRouteNarrative(
    params: RouteNarrativeRequest
  ): Promise<RouteNarrativeResponse> {
    const { routeDirectionId, countryCode, includeLocalInsights } = params;
    const queryParams = new URLSearchParams();
    
    if (countryCode) queryParams.append('countryCode', countryCode);
    if (includeLocalInsights) queryParams.append('includeLocalInsights', 'true');
    
    const response = await this.client.get<ApiResponse<RouteNarrativeResponse>>(
      `/route-narrative/${routeDirectionId}?${queryParams.toString()}`
    );
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || '获取路线叙事失败');
    }
    
    return response.data.data!;
  }

  /**
   * 获取当地洞察
   */
  async getLocalInsights(
    params: LocalInsightRequest
  ): Promise<LocalInsight[]> {
    const { countryCode, tags, region } = params;
    const queryParams = new URLSearchParams();
    
    queryParams.append('countryCode', countryCode);
    const tagsArray = Array.isArray(tags) ? tags : tags.split(',');
    tagsArray.forEach(tag => queryParams.append('tags', tag));
    if (region) queryParams.append('region', region);
    
    const response = await this.client.get<ApiResponse<{ insights: LocalInsight[] }>>(
      `/local-insight?${queryParams.toString()}`
    );
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || '获取当地洞察失败');
    }
    
    return response.data.data?.insights || [];
  }

  /**
   * 回答路线问题
   */
  async answerRouteQuestion(params: {
    question: string;
    routeDirectionId: string;
    countryCode: string;
    segmentId?: string;
    dayIndex?: number;
    tripId?: string;
  }): Promise<{ answer: string; sources: string[]; confidence: number }> {
    const response = await this.client.post<ApiResponse<{
      answer: string;
      sources: string[];
      confidence: number;
    }>>('/chat/answer-route-question', params);
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || '回答问题失败');
    }
    
    return response.data.data!;
  }

  /**
   * 获取目的地深度信息
   */
  async getDestinationInsights(params: {
    placeId: string;
    tripId?: string;
    countryCode?: string;
  }): Promise<{
    placeId: string;
    insights: {
      tips: string[];
      localInsights: LocalInsight[];
      routeInsights: any;
    };
    credibility: {
      ragSources: number;
      localInsightsCount: number;
      hasRouteContext: boolean;
    };
  }> {
    const queryParams = new URLSearchParams();
    queryParams.append('placeId', params.placeId);
    if (params.tripId) queryParams.append('tripId', params.tripId);
    if (params.countryCode) queryParams.append('countryCode', params.countryCode);
    
    const response = await this.client.get<ApiResponse<any>>(
      `/destination-insights?${queryParams.toString()}`
    );
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || '获取目的地信息失败');
    }
    
    return response.data.data!;
  }

  /**
   * 提取合规规则
   */
  async extractComplianceRules(
    params: ComplianceRulesRequest
  ): Promise<{
    tripId: string;
    countryCodes: string[];
    rules: any[];
    checklist: ComplianceRule[];
    summary: {
      totalRules: number;
      totalChecklistItems: number;
      categories: string[];
    };
  }> {
    const response = await this.client.post<ApiResponse<any>>(
      '/extract-compliance-rules',
      params
    );
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || '提取合规规则失败');
    }
    
    return response.data.data!;
  }

  /**
   * 获取 Rail Pass 规则
   */
  async getRailPassRules(params: {
    passType: string;
    countryCode: string;
  }): Promise<any> {
    const response = await this.client.post<ApiResponse<any>>(
      '/compliance/rail-pass',
      params
    );
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || '获取Rail Pass规则失败');
    }
    
    return response.data.data!;
  }

  /**
   * 获取 Trail Access 规则
   */
  async getTrailAccessRules(params: {
    trailId: string;
    countryCode: string;
  }): Promise<any> {
    const response = await this.client.post<ApiResponse<any>>(
      '/compliance/trail-access',
      params
    );
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || '获取Trail Access规则失败');
    }
    
    return response.data.data!;
  }

  /**
   * 获取知识库统计
   */
  async getStats(collection?: string): Promise<{
    totalDocuments: number;
    totalChunks: number;
    collections: string[];
    byCategory: Record<string, number>;
  }> {
    const queryParams = collection ? `?collection=${collection}` : '';
    const response = await this.client.get<ApiResponse<any>>(
      `/stats${queryParams}`
    );
    
    if (!response.data.success) {
      throw new Error(response.data.error?.message || '获取统计信息失败');
    }
    
    return response.data.data!;
  }
}

// 导出单例
export const ragApi = new RagApiClient();
```

---

## 🎣 React Hooks

### `src/hooks/useRagRetrieve.ts`

```typescript
import { useState, useCallback } from 'react';
import { ragApi } from '@/services/ragApi';
import type { ChunkRetrieveRequest, ChunkRetrieveResponse } from '@/types/rag';

interface UseRagRetrieveReturn {
  results: ChunkRetrieveResponse[];
  loading: boolean;
  error: Error | null;
  retrieve: (params: ChunkRetrieveRequest) => Promise<void>;
  clear: () => void;
}

export function useRagRetrieve(): UseRagRetrieveReturn {
  const [results, setResults] = useState<ChunkRetrieveResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const retrieve = useCallback(async (params: ChunkRetrieveRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await ragApi.retrieveChunks(params);
      setResults(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('检索失败');
      setError(error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, loading, error, retrieve, clear };
}
```

### `src/hooks/useRouteNarrative.ts`

```typescript
import { useState, useCallback } from 'react';
import { ragApi } from '@/services/ragApi';
import type { RouteNarrativeRequest, RouteNarrativeResponse } from '@/types/rag';

interface UseRouteNarrativeReturn {
  narrative: RouteNarrativeResponse | null;
  loading: boolean;
  error: Error | null;
  fetchNarrative: (params: RouteNarrativeRequest) => Promise<void>;
}

export function useRouteNarrative(): UseRouteNarrativeReturn {
  const [narrative, setNarrative] = useState<RouteNarrativeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchNarrative = useCallback(async (params: RouteNarrativeRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await ragApi.getRouteNarrative(params);
      setNarrative(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('获取路线叙事失败');
      setError(error);
      setNarrative(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { narrative, loading, error, fetchNarrative };
}
```

### `src/hooks/useLocalInsights.ts`

```typescript
import { useState, useCallback } from 'react';
import { ragApi } from '@/services/ragApi';
import type { LocalInsightRequest, LocalInsight } from '@/types/rag';

interface UseLocalInsightsReturn {
  insights: LocalInsight[];
  loading: boolean;
  error: Error | null;
  fetchInsights: (params: LocalInsightRequest) => Promise<void>;
}

export function useLocalInsights(): UseLocalInsightsReturn {
  const [insights, setInsights] = useState<LocalInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchInsights = useCallback(async (params: LocalInsightRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await ragApi.getLocalInsights(params);
      setInsights(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('获取当地洞察失败');
      setError(error);
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { insights, loading, error, fetchInsights };
}
```

### `src/hooks/useComplianceRules.ts`

```typescript
import { useState, useCallback } from 'react';
import { ragApi } from '@/services/ragApi';
import type { ComplianceRulesRequest, ComplianceRule } from '@/types/rag';

interface UseComplianceRulesReturn {
  checklist: ComplianceRule[];
  summary: {
    totalRules: number;
    totalChecklistItems: number;
    categories: string[];
  } | null;
  loading: boolean;
  error: Error | null;
  extractRules: (params: ComplianceRulesRequest) => Promise<void>;
}

export function useComplianceRules(): UseComplianceRulesReturn {
  const [checklist, setChecklist] = useState<ComplianceRule[]>([]);
  const [summary, setSummary] = useState<{
    totalRules: number;
    totalChecklistItems: number;
    categories: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const extractRules = useCallback(async (params: ComplianceRulesRequest) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await ragApi.extractComplianceRules(params);
      setChecklist(data.checklist);
      setSummary(data.summary);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('提取合规规则失败');
      setError(error);
      setChecklist([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { checklist, summary, loading, error, extractRules };
}
```

---

## 💻 使用示例

### 示例 1: 文档检索组件

```typescript
// src/components/RagSearch.tsx
import React, { useState, useMemo } from 'react';
import { useRagRetrieve } from '@/hooks/useRagRetrieve';
import { debounce } from 'lodash';

export function RagSearch() {
  const [query, setQuery] = useState('');
  const { results, loading, error, retrieve } = useRagRetrieve();

  // 防抖处理搜索
  const debouncedRetrieve = useMemo(
    () => debounce((searchQuery: string) => {
      if (searchQuery.trim()) {
        retrieve({
          query: searchQuery,
          limit: 5,
          credibilityMin: 0.5,
        });
      }
    }, 500),
    [retrieve]
  );

  const handleSearch = (value: string) => {
    setQuery(value);
    debouncedRetrieve(value);
  };

  return (
    <div className="rag-search">
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="搜索相关文档..."
        className="search-input"
      />
      
      {loading && <div className="loading">搜索中...</div>}
      
      {error && (
        <div className="error">
          搜索失败: {error.message}
        </div>
      )}
      
      {results.length > 0 && (
        <div className="results">
          <h3>搜索结果 ({results.length})</h3>
          {results.map((result) => (
            <div key={result.id} className="result-item">
              <div className="result-header">
                <span className="source-file">{result.sourceFile}</span>
                <span className="similarity">
                  相似度: {(result.similarity * 100).toFixed(1)}%
                </span>
              </div>
              <div className="result-content">
                {result.content.substring(0, 200)}...
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 示例 2: 路线详情页

```typescript
// src/components/RouteDetail.tsx
import React, { useEffect } from 'react';
import { useRouteNarrative } from '@/hooks/useRouteNarrative';
import { useLocalInsights } from '@/hooks/useLocalInsights';

interface RouteDetailProps {
  routeDirectionId: string;
  countryCode: string;
}

export function RouteDetail({ routeDirectionId, countryCode }: RouteDetailProps) {
  const { narrative, loading: narrativeLoading, fetchNarrative } = useRouteNarrative();
  const { insights, loading: insightsLoading, fetchInsights } = useLocalInsights();

  useEffect(() => {
    // 获取路线叙事
    fetchNarrative({
      routeDirectionId,
      countryCode,
      includeLocalInsights: true,
    });

    // 获取当地洞察
    fetchInsights({
      countryCode,
      tags: ['culture', 'tips', 'etiquette'],
    });
  }, [routeDirectionId, countryCode, fetchNarrative, fetchInsights]);

  if (narrativeLoading) {
    return <div>加载中...</div>;
  }

  return (
    <div className="route-detail">
      {narrative && (
        <>
          <h1>{narrative.narrative.route}</h1>
          <p>{narrative.narrative.description}</p>
          
          <div className="highlights">
            <h2>亮点</h2>
            <ul>
              {narrative.narrative.highlights.map((highlight, index) => (
                <li key={index}>{highlight}</li>
              ))}
            </ul>
          </div>
          
          <div className="tips">
            <h2>贴士</h2>
            <ul>
              {narrative.narrative.tips.map((tip, index) => (
                <li key={index}>{tip}</li>
              ))}
            </ul>
          </div>
        </>
      )}
      
      {insights.length > 0 && (
        <div className="local-insights">
          <h2>当地洞察</h2>
          {insights.map((insight, index) => (
            <div key={index} className="insight-item">
              <p>{insight.content}</p>
              <div className="tags">
                {insight.tags.map(tag => (
                  <span key={tag} className="tag">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 示例 3: 合规规则检查组件

```typescript
// src/components/ComplianceChecklist.tsx
import React, { useEffect } from 'react';
import { useComplianceRules } from '@/hooks/useComplianceRules';

interface ComplianceChecklistProps {
  tripId: string;
  countryCodes: string[];
}

export function ComplianceChecklist({ tripId, countryCodes }: ComplianceChecklistProps) {
  const { checklist, summary, loading, error, extractRules } = useComplianceRules();

  useEffect(() => {
    extractRules({
      tripId,
      countryCodes,
      ruleTypes: ['VISA', 'TRANSPORT', 'ENTRY'],
    });
  }, [tripId, countryCodes, extractRules]);

  if (loading) {
    return <div>加载合规规则...</div>;
  }

  if (error) {
    return <div className="error">加载失败: {error.message}</div>;
  }

  return (
    <div className="compliance-checklist">
      {summary && (
        <div className="summary">
          <h3>合规规则摘要</h3>
          <p>总规则数: {summary.totalRules}</p>
          <p>检查项: {summary.totalChecklistItems}</p>
          <p>分类: {summary.categories.join(', ')}</p>
        </div>
      )}
      
      <div className="checklist">
        {checklist.map((category, index) => (
          <div key={index} className="category">
            <h4>{category.category}</h4>
            <ul>
              {category.items.map((item, itemIndex) => (
                <li key={itemIndex} className="checklist-item">
                  <input
                    type="checkbox"
                    id={`item-${index}-${itemIndex}`}
                  />
                  <label htmlFor={`item-${index}-${itemIndex}`}>
                    {item.description}
                    {item.required && <span className="required">*</span>}
                    {item.deadline && (
                      <span className="deadline">截止: {item.deadline}</span>
                    )}
                  </label>
                  <span className="source">来源: {item.source}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 示例 4: 智能问答组件

```typescript
// src/components/RouteQuestion.tsx
import React, { useState } from 'react';
import { ragApi } from '@/services/ragApi';

interface RouteQuestionProps {
  routeDirectionId: string;
  countryCode: string;
}

export function RouteQuestion({ routeDirectionId, countryCode }: RouteQuestionProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!question.trim()) return;

    setLoading(true);
    setError(null);
    setAnswer(null);

    try {
      const result = await ragApi.answerRouteQuestion({
        question,
        routeDirectionId,
        countryCode,
      });
      
      setAnswer(result.answer);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('回答问题失败');
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="route-question">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="关于这条路线，你想问什么？"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()}>
          {loading ? '回答中...' : '提问'}
        </button>
      </form>

      {error && (
        <div className="error">
          错误: {error.message}
        </div>
      )}

      {answer && (
        <div className="answer">
          <h4>回答:</h4>
          <p>{answer}</p>
        </div>
      )}
    </div>
  );
}
```

---

## 🎨 样式示例

### `src/styles/rag-components.css`

```css
/* 搜索组件样式 */
.rag-search {
  max-width: 800px;
  margin: 0 auto;
}

.search-input {
  width: 100%;
  padding: 12px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
}

.loading {
  margin-top: 16px;
  text-align: center;
  color: #666;
}

.error {
  margin-top: 16px;
  padding: 12px;
  background-color: #fee;
  color: #c33;
  border-radius: 4px;
}

.results {
  margin-top: 24px;
}

.result-item {
  padding: 16px;
  margin-bottom: 16px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
}

.result-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  color: #666;
}

.source-file {
  font-weight: 600;
  color: #333;
}

.similarity {
  color: #0a7;
  font-weight: 600;
}

.result-content {
  color: #555;
  line-height: 1.6;
}

/* 路线详情样式 */
.route-detail {
  max-width: 1000px;
  margin: 0 auto;
  padding: 24px;
}

.highlights ul,
.tips ul {
  list-style: none;
  padding: 0;
}

.highlights li,
.tips li {
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}

/* 合规检查清单样式 */
.compliance-checklist {
  max-width: 800px;
  margin: 0 auto;
}

.summary {
  padding: 16px;
  background: #f5f5f5;
  border-radius: 8px;
  margin-bottom: 24px;
}

.category {
  margin-bottom: 24px;
}

.checklist-item {
  display: flex;
  align-items: flex-start;
  padding: 12px;
  margin-bottom: 8px;
  border: 1px solid #eee;
  border-radius: 4px;
}

.checklist-item input[type="checkbox"] {
  margin-right: 12px;
  margin-top: 4px;
}

.checklist-item label {
  flex: 1;
  cursor: pointer;
}

.required {
  color: #c33;
  margin-left: 4px;
}

.deadline {
  display: block;
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.source {
  font-size: 12px;
  color: #999;
  margin-left: 12px;
}
```

---

## 📝 使用建议

### 1. 错误处理
- 始终处理错误情况，给用户友好的提示
- 区分网络错误、API错误和业务错误

### 2. 加载状态
- 显示加载指示器，提升用户体验
- 对于长时间操作（如重建索引），显示进度条

### 3. 性能优化
- 使用防抖/节流处理搜索输入
- 缓存不经常变化的数据
- 使用 React.memo 优化组件渲染

### 4. 用户体验
- 提供空状态提示
- 显示数据来源和可信度
- 支持错误重试

---

**维护者**: 请保持此文档与代码同步更新  
**最后验证**: 2026-01-23
