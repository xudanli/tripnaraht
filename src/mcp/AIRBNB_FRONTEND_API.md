# Airbnb MCP 前端 API 文档

## 📋 概述

本文档说明如何在前端使用 Airbnb MCP 服务进行房源搜索和详情查询。

**Base URL**: `/api/airbnb`

**认证**: 当前所有接口均为公开接口（`@Public()`），生产环境可能需要添加认证。

**服务器**: 当前使用 `geobio/mcp-server-airbnb`，提供以下功能：
- ✅ 搜索房源 (`airbnb_search`)
- ✅ 获取房源详情 (`airbnb_listing_details`)，**包含照片信息**

**重要变更**: 已从 `iclickfreedownloads/mcp-server-airbnb` 切换到 `geobio/mcp-server-airbnb`。新版本只提供 2 个核心工具，照片信息已集成在房源详情中，无需单独调用照片 API。

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

---

## 🎯 API 端点

**接口列表**:
1. [POST /airbnb/search - 搜索房源](#1-post-airbnbsearch---搜索房源)
2. [GET /airbnb/listing/:listingId - 获取房源详情](#2-get-airbnblistinglistingid---获取房源详情)
3. [GET /airbnb/tools - 列出所有可用工具](#3-get-airbnbtools---列出所有可用工具)
4. [GET /airbnb/auth/status - 检查授权状态](#4-get-airbnbathstatus---检查授权状态)
5. [GET /airbnb/auth/url - 获取授权 URL](#5-get-airbnbathurl---获取授权-url)
6. [POST /airbnb/auth/verify - 验证授权](#6-post-airbnbathverify---验证授权)
7. [GET /airbnb/monitoring/stats - 获取使用统计](#7-get-airbnbmonitoringstats---获取使用统计) ⭐ 新增
8. [GET /airbnb/monitoring/cost-check - 检查成本限制](#8-get-airbnbmonitoringcost-check---检查成本限制) ⭐ 新增

---

### 1. POST /airbnb/search - 搜索房源

**用途**: 根据位置、日期、人数等条件搜索 Airbnb 房源

**请求**:
```http
POST /api/airbnb/search
Content-Type: application/json

{
  "location": "Reykjavik, Iceland",
  "adults": 2,
  "children": 0,
  "infants": 0,
  "pets": 0,
  "checkin": "2026-02-07",
  "checkout": "2026-02-12",
  "page": 1,
  "ignoreRobotsText": false
}
```

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| location | string | ✅ | 搜索位置 | `"Reykjavik, Iceland"` |
| adults | number | ❌ | 成人数（默认: 1） | `2` |
| children | number | ❌ | 儿童数（默认: 0） | `0` |
| infants | number | ❌ | 婴儿数（默认: 0） | `0` |
| pets | number | ❌ | 宠物数（默认: 0） | `0` |
| checkin | string | ❌ | 入住日期（YYYY-MM-DD） | `"2026-02-07"` |
| checkout | string | ❌ | 退房日期（YYYY-MM-DD） | `"2026-02-12"` |
| page | number | ❌ | 页码（默认: 1） | `1` |
| ignoreRobotsText | boolean | ❌ | 是否忽略 robots.txt（仅用于测试，默认: false） | `false` |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "searchUrl": "https://www.airbnb.com/s/Reykjavik%2C%20Iceland/homes?adults=2&children=0&infants=0&pets=0",
    "results": [
      {
        "id": "1573970428683000922",
        "url": "https://www.airbnb.com/rooms/1573970428683000922",
        "demandStayListing": {
          "id": "RGVtYW5kU3RheUxpc3Rpbmc6MTU3Mzk3MDQyODY4MzAwMDkyMg==",
          "description": {
            "name": {
              "localizedStringWithTranslationPreference": "EIR One Bedroom Apartments"
            }
          },
          "location": {
            "coordinate": {
              "latitude": 64.14463,
              "longitude": -21.92006
            }
          }
        },
        "badges": "",
        "structuredContent": {
          "primaryLine": "1 bedroom, 2 beds",
          "secondaryLine": "Feb 7 – 12"
        },
        "avgRatingA11yLabel": "5.0 out of 5 average rating,  4 reviews",
        "structuredDisplayPrice": {
          "primaryLine": {
            "accessibilityLabel": "$803 for 5 nights, originally $1,101"
          }
        }
      }
    ],
    "total": 18
  }
}
```

**错误响应**:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "需要完成 OAuth 认证",
    "details": {
      "authorizationUrl": "https://..."
    }
  }
}
```

---

### 2. GET /airbnb/listing/:listingId - 获取房源详情

**用途**: 根据房源 ID 获取详细信息

**请求**:
```http
GET /api/airbnb/listing/1573970428683000922?checkin=2026-02-07&checkout=2026-02-12&adults=2
```

**路径参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| listingId | string | ✅ | 房源 ID | `"1573970428683000922"` |

**查询参数**（可选）:

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| checkin | string | ❌ | 入住日期（YYYY-MM-DD） |
| checkout | string | ❌ | 退房日期（YYYY-MM-DD） |
| adults | number | ❌ | 成人数 |
| children | number | ❌ | 儿童数 |
| infants | number | ❌ | 婴儿数 |
| pets | number | ❌ | 宠物数 |
| ignoreRobotsText | boolean | ❌ | 是否忽略 robots.txt |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "listingId": "1573970428683000922",
    "name": "EIR One Bedroom Apartments",
    "description": "...",
    "amenities": [...],
    "photos": [...],  // 照片信息包含在详情响应中
    "host": {...},
    "reviews": [...]
  }
}
```

---

### 3. GET /airbnb/tools - 列出所有可用工具

**用途**: 获取 Airbnb MCP 服务器提供的所有工具列表

**请求**:
```http
GET /api/airbnb/tools
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "airbnb_search",
        "description": "Search for Airbnb listings with various filters and pagination. Provide direct links to the user"
      },
      {
        "name": "airbnb_listing_details",
        "description": "Get detailed information about a specific Airbnb listing. Provide direct links to the user"
      }
    ]
  }
}
```

**注意**: `geobio/mcp-server-airbnb` 只提供 2 个工具。照片信息可以通过 `airbnb_listing_details` 获取，包含在房源详情响应中。

---

## 💻 前端使用示例

### TypeScript/React 示例

```typescript
// api/airbnb.ts
const API_BASE_URL = '/api/airbnb';

export interface AirbnbSearchParams {
  location: string;
  adults?: number;
  children?: number;
  infants?: number;
  pets?: number;
  checkin?: string;
  checkout?: string;
  page?: number;
  ignoreRobotsText?: boolean;
}

export interface AirbnbListing {
  id: string;
  url: string;
  demandStayListing: {
    description: {
      name: {
        localizedStringWithTranslationPreference: string;
      };
    };
    location: {
      coordinate: {
        latitude: number;
        longitude: number;
      };
    };
  };
  badges: string;
  structuredContent: {
    primaryLine: string;
    secondaryLine: string;
  };
  avgRatingA11yLabel: string;
  structuredDisplayPrice: {
    primaryLine: {
      accessibilityLabel: string;
    };
  };
}

export interface AirbnbSearchResponse {
  searchUrl: string;
  results: AirbnbListing[];
  total: number;
}

export async function searchAirbnbListings(
  params: AirbnbSearchParams
): Promise<AirbnbSearchResponse> {
  const response = await fetch(`${API_BASE_URL}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '搜索失败');
  }

  return data.data;
}

export async function getAirbnbListingDetails(
  listingId: string,
  params?: {
    checkin?: string;
    checkout?: string;
    adults?: number;
    children?: number;
    infants?: number;
    pets?: number;
  }
) {
  const queryParams = new URLSearchParams();
  if (params?.checkin) queryParams.append('checkin', params.checkin);
  if (params?.checkout) queryParams.append('checkout', params.checkout);
  if (params?.adults) queryParams.append('adults', params.adults.toString());
  if (params?.children) queryParams.append('children', params.children.toString());
  if (params?.infants) queryParams.append('infants', params.infants.toString());
  if (params?.pets) queryParams.append('pets', params.pets.toString());

  const url = `${API_BASE_URL}/listing/${listingId}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '获取详情失败');
  }

  return data.data;
}
```

### React Hook 示例

```typescript
// hooks/useAirbnbSearch.ts
import { useState, useCallback } from 'react';
import { searchAirbnbListings, AirbnbSearchParams, AirbnbSearchResponse } from '../api/airbnb';

export function useAirbnbSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AirbnbSearchResponse | null>(null);

  const search = useCallback(async (params: AirbnbSearchParams) => {
    setLoading(true);
    setError(null);

    try {
      const data = await searchAirbnbListings(params);
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

### React 组件示例

```tsx
// components/AirbnbSearch.tsx
import React, { useState } from 'react';
import { useAirbnbSearch } from '../hooks/useAirbnbSearch';

export function AirbnbSearch() {
  const [location, setLocation] = useState('');
  const [adults, setAdults] = useState(2);
  const { search, loading, error, results } = useAirbnbSearch();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await search({
      location,
      adults,
      children: 0,
      infants: 0,
      pets: 0,
    });
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="输入位置，例如：Reykjavik, Iceland"
        />
        <input
          type="number"
          value={adults}
          onChange={(e) => setAdults(parseInt(e.target.value))}
          placeholder="成人数"
        />
        <button type="submit" disabled={loading}>
          {loading ? '搜索中...' : '搜索'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {results && (
        <div>
          <h3>找到 {results.total} 个房源</h3>
          {results.results.map((listing) => (
            <div key={listing.id} className="listing-card">
              <h4>{listing.demandStayListing.description.name.localizedStringWithTranslationPreference}</h4>
              <p>{listing.structuredContent.primaryLine}</p>
              <p>{listing.avgRatingA11yLabel}</p>
              <p>{listing.structuredDisplayPrice.primaryLine.accessibilityLabel}</p>
              <a href={listing.url} target="_blank" rel="noopener noreferrer">
                查看详情
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### 7. GET /airbnb/monitoring/stats - 获取使用统计 ⭐ 新增

**用途**: 获取 Airbnb API 的使用统计信息，包括每日统计、性能指标和成本估算

**请求**:
```http
GET /api/airbnb/monitoring/stats?days=7
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
        "totalCalls": 45,
        "successfulCalls": 43,
        "failedCalls": 2,
        "avgResponseTime": 1850,
        "callsByTool": {
          "airbnb_search": 40,
          "airbnb_listing_details": 5
        },
        "estimatedCost": 0.0045
      }
    ],
    "performance": {
      "avgResponseTime": 1850,
      "successRate": 0.956,
      "totalCalls": 45,
      "callsByTool": {
        "airbnb_search": 40,
        "airbnb_listing_details": 5
      }
    },
    "totalCostEstimate": 0.0045
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
const response = await fetch('/api/airbnb/monitoring/stats?days=7');
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

**React Hook 示例**:
```typescript
// hooks/useAirbnbMonitoring.ts
import { useState, useCallback } from 'react';

export function useAirbnbMonitoring() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const getStats = useCallback(async (days: number = 7) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/airbnb/monitoring/stats?days=${days}`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data);
      } else {
        setError(data.error?.message || '获取统计失败');
      }
    } catch (err: any) {
      setError(err.message || '获取统计失败');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    getStats,
    loading,
    stats,
    error,
  };
}
```

---

### 8. GET /airbnb/monitoring/cost-check - 检查成本限制 ⭐ 新增

**用途**: 检查今日 Airbnb API 调用成本是否超过限制

**请求**:
```http
GET /api/airbnb/monitoring/cost-check?dailyLimit=1
```

**查询参数**:
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| dailyLimit | number | ❌ | 每日成本限制（USD，默认 1） | `1` |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "exceeded": false,
    "currentCost": 0.0045,
    "limit": 1
  }
}
```

**响应字段说明**:
- `exceeded`: 是否超过限制
- `currentCost`: 当前成本（USD）
- `limit`: 成本限制（USD）

**前端使用示例**:
```typescript
// 检查成本限制（默认 $1）
const response = await fetch('/api/airbnb/monitoring/cost-check?dailyLimit=1');
const data = await response.json();

if (data.success) {
  if (data.data.exceeded) {
    console.warn(`⚠️  成本超过限制: $${data.data.currentCost.toFixed(4)} / $${data.data.limit}`);
  } else {
    console.log(`✅ 成本在限制内: $${data.data.currentCost.toFixed(4)} / $${data.data.limit}`);
  }
}
```

**React Hook 示例**:
```typescript
// hooks/useAirbnbCostCheck.ts
import { useState, useCallback } from 'react';

export function useAirbnbCostCheck() {
  const [loading, setLoading] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const checkCost = useCallback(async (dailyLimit: number = 1) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/airbnb/monitoring/cost-check?dailyLimit=${dailyLimit}`);
      const data = await response.json();
      
      if (data.success) {
        setCheckResult(data.data);
      } else {
        setError(data.error?.message || '检查成本限制失败');
      }
    } catch (err: any) {
      setError(err.message || '检查成本限制失败');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    checkCost,
    loading,
    checkResult,
    error,
  };
}
```

---

### 4. GET /airbnb/auth/status - 检查授权状态

**用途**: 检查当前是否已完成 Airbnb OAuth 授权

**请求**:
```http
GET /api/airbnb/auth/status
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "isAuthorized": true,
    "connectionId": "meadowlark-bEDi"
  }
}
```

或未授权时：

```json
{
  "success": true,
  "data": {
    "isAuthorized": false,
    "authorizationUrl": "https://..."
  }
}
```

---

### 5. GET /airbnb/auth/url - 获取授权 URL

**用途**: 获取 Airbnb OAuth 授权 URL，用户需要访问此 URL 完成授权

**请求**:
```http
GET /api/airbnb/auth/url
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://www.airbnb.com/oauth/authorize?...",
    "connectionId": "meadowlark-bEDi"
  }
}
```

**错误响应**（已授权）:

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "已经完成授权，无需再次授权"
  }
}
```

---

### 6. POST /airbnb/auth/verify - 验证授权

**用途**: 验证指定的 connectionId 是否已完成授权

**请求**:
```http
POST /api/airbnb/auth/verify
Content-Type: application/json

{
  "connectionId": "meadowlark-bEDi"
}
```

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| connectionId | string | ✅ | 连接 ID（从授权 URL 获取） | `"meadowlark-bEDi"` |

**响应示例**:

```json
{
  "success": true,
  "data": {
    "isAuthorized": true,
    "message": "授权成功"
  }
}
```

或授权未完成：

```json
{
  "success": true,
  "data": {
    "isAuthorized": false,
    "message": "授权尚未完成，请完成 OAuth 流程"
  }
}
```

---

## 🔐 OAuth 授权流程

### 完整授权流程

1. **检查授权状态**
   ```typescript
   const statusResponse = await fetch('/api/airbnb/auth/status');
   const status = await statusResponse.json();
   
   if (status.data.isAuthorized) {
     // 已授权，可以直接使用
     console.log('已授权，connectionId:', status.data.connectionId);
   } else {
     // 需要授权
   }
   ```

2. **获取授权 URL**
   ```typescript
   const urlResponse = await fetch('/api/airbnb/auth/url');
   const urlData = await urlResponse.json();
   
   if (urlData.success) {
     const { authorizationUrl, connectionId } = urlData.data;
     
     // 保存 connectionId（用于后续验证）
     localStorage.setItem('airbnb_connection_id', connectionId);
     
     // 打开授权页面
     window.open(authorizationUrl, '_blank');
   }
   ```

3. **用户完成授权**
   - 用户在 Airbnb 页面完成授权
   - 授权完成后，Airbnb 会重定向到回调页面

4. **验证授权**
   ```typescript
   const connectionId = localStorage.getItem('airbnb_connection_id');
   
   const verifyResponse = await fetch('/api/airbnb/auth/verify', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ connectionId }),
   });
   
   const verifyData = await verifyResponse.json();
   
   if (verifyData.data.isAuthorized) {
     console.log('授权成功！');
     // 现在可以使用搜索等功能了
   }
   ```

### React Hook 示例

```typescript
// hooks/useAirbnbAuth.ts
import { useState, useCallback } from 'react';

export function useAirbnbAuth() {
  const [loading, setLoading] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/airbnb/auth/status');
      const data = await response.json();
      
      if (data.success) {
        setIsAuthorized(data.data.isAuthorized);
        setConnectionId(data.data.connectionId || null);
      }
    } catch (error) {
      console.error('Check auth status failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const getAuthUrl = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/airbnb/auth/url');
      const data = await response.json();
      
      if (data.success) {
        const { authorizationUrl, connectionId } = data.data;
        setConnectionId(connectionId);
        localStorage.setItem('airbnb_connection_id', connectionId);
        
        // 打开授权页面
        window.open(authorizationUrl, '_blank');
        
        return { authorizationUrl, connectionId };
      }
    } catch (error) {
      console.error('Get auth URL failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyAuth = useCallback(async (connectionIdToVerify: string) => {
    setLoading(true);
    try {
      const response = await fetch('/api/airbnb/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connectionIdToVerify }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsAuthorized(data.data.isAuthorized);
        return data.data.isAuthorized;
      }
    } catch (error) {
      console.error('Verify auth failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    isAuthorized,
    connectionId,
    checkStatus,
    getAuthUrl,
    verifyAuth,
  };
}
```

### React 组件示例

```tsx
// components/AirbnbAuth.tsx
import React, { useEffect, useState } from 'react';
import { useAirbnbAuth } from '../hooks/useAirbnbAuth';

export function AirbnbAuth() {
  const { loading, isAuthorized, connectionId, checkStatus, getAuthUrl, verifyAuth } = useAirbnbAuth();
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleAuthorize = async () => {
    await getAuthUrl();
    setPolling(true);
    
    // 轮询检查授权状态
    const interval = setInterval(async () => {
      if (connectionId) {
        const authorized = await verifyAuth(connectionId);
        if (authorized) {
          setPolling(false);
          clearInterval(interval);
          await checkStatus(); // 刷新状态
        }
      }
    }, 3000); // 每 3 秒检查一次

    // 10 分钟后停止轮询
    setTimeout(() => {
      clearInterval(interval);
      setPolling(false);
    }, 600000);
  };

  if (loading) {
    return <div>检查授权状态...</div>;
  }

  if (isAuthorized) {
    return (
      <div className="auth-status authorized">
        <p>✅ 已授权</p>
        <p>Connection ID: {connectionId}</p>
      </div>
    );
  }

  return (
    <div className="auth-status unauthorized">
      <p>❌ 未授权</p>
      <button onClick={handleAuthorize} disabled={polling}>
        {polling ? '等待授权中...' : '开始授权'}
      </button>
      {polling && (
        <p className="polling-hint">
          请在弹出的窗口中完成授权，授权完成后会自动检测
        </p>
      )}
    </div>
  );
}
```

---

## 📊 监控和成本管理

### 成本估算

Airbnb API 的成本估算基于以下定价（实际价格可能不同）：
- `airbnb_search`: 每次调用约 $0.0001
- `airbnb_listing_details`: 每次调用约 $0.0001

**注意**: Airbnb MCP 服务可能是免费的，成本估算仅供参考。

### 监控最佳实践

1. **定期检查成本**
   ```typescript
   // 每日检查成本限制
   const checkResult = await fetch('/api/airbnb/monitoring/cost-check?dailyLimit=1');
   ```

2. **监控性能指标**
   ```typescript
   // 获取最近 7 天的性能指标
   const stats = await fetch('/api/airbnb/monitoring/stats?days=7');
   ```

3. **设置告警**
   - 当成本超过限制时，可以设置告警通知
   - 当成功率低于阈值时，可以检查 API 连接状态

### TypeScript 类型定义

```typescript
// types/airbnb-monitoring.ts
export interface AirbnbDailyStats {
  date: string;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  avgResponseTime: number;
  callsByTool: Record<string, number>;
  estimatedCost: number;
}

export interface AirbnbPerformanceMetrics {
  avgResponseTime: number;
  successRate: number;
  totalCalls: number;
  callsByTool: Record<string, number>;
}

export interface AirbnbMonitoringStatsResponse {
  dailyStats: AirbnbDailyStats[];
  performance: AirbnbPerformanceMetrics;
  totalCostEstimate: number;
}

export interface AirbnbCostCheckResponse {
  exceeded: boolean;
  currentCost: number;
  limit: number;
}
```

---

## ⚠️ 注意事项

1. **robots.txt 限制**: 
   - Airbnb 的 robots.txt 默认会阻止某些请求
   - 测试时可以设置 `ignoreRobotsText: true`
   - 生产环境建议遵守 robots.txt 规则

2. **OAuth 认证**: 
   - 首次使用可能需要完成 OAuth 认证
   - 如果返回 `UNAUTHORIZED` 错误，需要访问 `details.authorizationUrl` 完成认证
   - 认证完成后，connectionId 会自动保存，后续请求无需再次认证

3. **错误处理**: 
   - 所有接口都返回统一的响应格式
   - 检查 `success` 字段判断是否成功
   - 失败时查看 `error` 字段获取错误信息

4. **API Key**: 
   - 后端需要设置 `SMITHERY_API_KEY` 环境变量
   - 前端无需关心 API Key，由后端统一管理

---

## 📚 相关文档

- [Airbnb Connect API 指南](./AIRBNB_CONNECT_API_GUIDE.md)
- [Connect API 快速开始](./CONNECT_API_QUICKSTART.md)
- [Airbnb 搜索示例](./AIRBNB_SEARCH_EXAMPLE.md)

---

**状态**: ✅ 已实现并测试通过

**最后更新**: 2026-02-06  
**更新内容**: 
- ✅ 新增监控端点：`GET /airbnb/monitoring/stats` 和 `GET /airbnb/monitoring/cost-check`
- ✅ 添加成本管理和监控最佳实践说明
- ✅ 添加 TypeScript 类型定义和使用示例
