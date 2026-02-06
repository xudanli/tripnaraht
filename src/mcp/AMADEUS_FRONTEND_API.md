# Amadeus MCP 前端 API 文档

## 📋 概述

本文档说明如何在前端使用 Amadeus MCP 服务进行航班搜索。

**Base URL**: `/api/amadeus`

**认证**: 当前所有接口均为公开接口（`@Public()`），生产环境可能需要添加认证。

**服务器**: 使用 `@almogqwinz/mcp-amadeus-api`，提供以下功能：
- ✅ 搜索航班 (`search_flight_offers`)
- ✅ Ping 测试 (`ping`)

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
- `UNAUTHORIZED`: 需要完成 OAuth 认证
- `BAD_REQUEST`: 请求参数错误
- `INTERNAL_ERROR`: 服务器内部错误

---

## 🎯 API 端点

### 1. POST /amadeus/search/flights - 搜索航班

**用途**: 使用 Amadeus API 搜索航班，支持单程和往返航班

**请求**:
```http
POST /api/amadeus/search/flights
Content-Type: application/json

{
  "originLocationCode": "SYD",
  "destinationLocationCode": "BKK",
  "departureDate": "2026-05-02",
  "adults": 1,
  "returnDate": "2026-05-10",
  "travelClass": "ECONOMY",
  "nonStop": false,
  "max": 10
}
```

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| originLocationCode | string | ✅ | 出发地 IATA 代码 | `"SYD"` |
| destinationLocationCode | string | ✅ | 目的地 IATA 代码 | `"BKK"` |
| departureDate | string | ✅ | 出发日期（YYYY-MM-DD） | `"2026-05-02"` |
| adults | number | ✅ | 成人数（1-9） | `1` |
| returnDate | string | ❌ | 返程日期（YYYY-MM-DD，往返航班） | `"2026-05-10"` |
| children | number | ❌ | 儿童数（2-11岁，默认: 0） | `0` |
| infants | number | ❌ | 婴儿数（≤2岁，默认: 0，不能超过成人数） | `0` |
| travelClass | string | ❌ | 舱位等级 | `"ECONOMY"` |
| includedAirlineCodes | string | ❌ | 包含的航空公司代码（逗号分隔） | `"6X,7X"` |
| excludedAirlineCodes | string | ❌ | 排除的航空公司代码（逗号分隔） | `"6X,7X"` |
| nonStop | boolean | ❌ | 是否仅返回直飞航班（默认: false） | `false` |
| currencyCode | string | ❌ | 货币代码（ISO 4217，例如：EUR） | `"EUR"` |
| maxPrice | number | ❌ | 每人最高价格（正整数，无小数） | `1000` |
| max | number | ❌ | 返回的最大航班数量（默认: 250） | `10` |

**参数说明**:
- **IATA 代码**: 必须使用机场的三字母 IATA 代码，不是城市名称
  - 常见示例：`SYD`（悉尼）、`BKK`（曼谷）、`JFK`（纽约肯尼迪）、`LHR`（伦敦希思罗）
- **日期格式**: 必须使用 ISO 8601 格式 `YYYY-MM-DD`
- **成人数限制**: 1-9 人，且成人数 + 儿童数 ≤ 9
- **婴儿数限制**: 不能超过成人数
- **舱位等级**: `ECONOMY`（经济舱）、`PREMIUM_ECONOMY`（高级经济舱）、`BUSINESS`（商务舱）、`FIRST`（头等舱）

**成功响应示例**:

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "type": "flight-offer",
        "id": "1",
        "source": "GDS",
        "instantTicketingRequired": false,
        "nonHomogeneous": false,
        "oneWay": false,
        "lastTicketingDate": "2026-05-01",
        "numberOfBookableSeats": 9,
        "itineraries": [
          {
            "duration": "PT14H30M",
            "segments": [
              {
                "departure": {
                  "iataCode": "SYD",
                  "terminal": "1",
                  "at": "2026-05-02T10:00:00"
                },
                "arrival": {
                  "iataCode": "BKK",
                  "terminal": "1",
                  "at": "2026-05-02T15:30:00"
                },
                "carrierCode": "TG",
                "number": "476",
                "aircraft": {
                  "code": "777"
                },
                "duration": "PT9H30M",
                "numberOfStops": 0
              }
            ]
          }
        ],
        "price": {
          "currency": "EUR",
          "total": "1000.00",
          "base": "800.00",
          "fees": [
            {
              "amount": "100.00",
              "type": "SUPPLIER"
            },
            {
              "amount": "100.00",
              "type": "TICKETING"
            }
          ],
          "grandTotal": "1000.00"
        },
        "pricingOptions": {
          "fareType": ["PUBLISHED"],
          "includedCheckedBagsOnly": true
        },
        "validatingAirlineCodes": ["TG"],
        "travelerPricings": [
          {
            "travelerId": "1",
            "fareOption": "STANDARD",
            "travelerType": "ADULT",
            "price": {
              "currency": "EUR",
              "total": "1000.00",
              "base": "800.00"
            },
            "fareDetailsBySegment": [
              {
                "segmentId": "1",
                "cabin": "ECONOMY",
                "fareBasis": "Y",
                "class": "Y",
                "includedCheckedBags": {
                  "quantity": 1
                }
              }
            ]
          }
        ]
      }
    ],
    "dictionaries": {
      "locations": {
        "SYD": {
          "cityCode": "SYD",
          "countryCode": "AU"
        },
        "BKK": {
          "cityCode": "BKK",
          "countryCode": "TH"
        }
      },
      "aircraft": {
        "777": "Boeing 777"
      },
      "currencies": {
        "EUR": "Euro"
      },
      "carriers": {
        "TG": "Thai Airways International"
      }
    },
    "meta": {
      "count": 1,
      "links": {
        "self": "https://test.api.amadeus.com/v2/shopping/flight-offers"
      }
    }
  }
}
```

**错误响应示例**:

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "需要完成 OAuth 认证",
    "details": {
      "authorizationUrl": "https://smithery.ai/..."
    }
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Adults must be between 1 and 9"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Configuration required",
    "details": {
      "message": "Amadeus API credentials not configured. Please provide your Amadeus API credentials when connecting to this server."
    }
  }
}
```

---

### 2. GET /amadeus/ping - Ping 测试

**用途**: 测试 Amadeus MCP 服务器连接（不需要凭证）

**请求**:
```http
GET /api/amadeus/ping
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "content": [
      {
        "type": "text",
        "text": "pong"
      }
    ],
    "structuredContent": {
      "result": "pong"
    }
  }
}
```

**错误响应示例**:

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Ping 失败"
  }
}
```

---

### 3. GET /amadeus/tools - 列出所有可用工具

**用途**: 获取 Amadeus MCP 服务器提供的所有工具列表

**请求**:
```http
GET /api/amadeus/tools
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "ping",
        "description": "Simple ping tool to test server connectivity",
        "inputSchema": {
          "type": "object",
          "properties": {},
          "required": []
        }
      },
      {
        "name": "search_flight_offers",
        "description": "Search for flight offers using the Amadeus API",
        "inputSchema": {
          "type": "object",
          "properties": {
            "originLocationCode": {
              "type": "string",
              "description": "IATA code of the departure city/airport (e.g., SYD for Sydney)"
            },
            "destinationLocationCode": {
              "type": "string",
              "description": "IATA code of the destination city/airport (e.g., BKK for Bangkok)"
            },
            "departureDate": {
              "type": "string",
              "description": "Departure date in ISO 8601 format (YYYY-MM-DD, e.g., 2023-05-02)"
            },
            "adults": {
              "type": "integer",
              "description": "Number of adult travelers (age 12+), must be 1-9"
            },
            "returnDate": {
              "type": "string",
              "description": "Return date in ISO 8601 format (YYYY-MM-DD), if round-trip is desired"
            },
            "children": {
              "type": "integer",
              "description": "Number of child travelers (age 2-11)"
            },
            "infants": {
              "type": "integer",
              "description": "Number of infant travelers (age <= 2)"
            },
            "travelClass": {
              "type": "string",
              "description": "Travel class (ECONOMY, PREMIUM_ECONOMY, BUSINESS, FIRST)"
            },
            "includedAirlineCodes": {
              "type": "string",
              "description": "Comma-separated IATA airline codes to include (e.g., '6X,7X')"
            },
            "excludedAirlineCodes": {
              "type": "string",
              "description": "Comma-separated IATA airline codes to exclude (e.g., '6X,7X')"
            },
            "nonStop": {
              "type": "boolean",
              "description": "If true, only non-stop flights are returned"
            },
            "currencyCode": {
              "type": "string",
              "description": "ISO 4217 currency code (e.g., EUR for Euro)"
            },
            "maxPrice": {
              "type": "integer",
              "description": "Maximum price per traveler, positive integer with no decimals"
            },
            "max": {
              "type": "integer",
              "description": "Maximum number of flight offers to return"
            }
          },
          "required": [
            "originLocationCode",
            "destinationLocationCode",
            "departureDate",
            "adults"
          ]
        }
      }
    ]
  }
}
```

---

### 4. GET /amadeus/auth/status - 检查授权状态

**用途**: 检查当前是否已完成 Amadeus MCP 连接授权

**请求**:
```http
GET /api/amadeus/auth/status
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "isAuthorized": true,
    "isConnected": true,
    "connectionId": "bee-iw40"
  }
}
```

```json
{
  "success": true,
  "data": {
    "isAuthorized": false,
    "isConnected": false,
    "connectionId": null
  }
}
```

---

### 5. GET /amadeus/auth/url - 获取授权 URL

**用途**: 获取 Amadeus OAuth 授权 URL，用户需要访问此 URL 完成授权

**请求**:
```http
GET /api/amadeus/auth/url
```

**响应示例**:

```json
{
  "success": true,
  "data": {
    "authorizationUrl": "https://smithery.ai/connect/authorize?connection=...",
    "connectionId": "bee-iw40"
  }
}
```

**错误响应示例**:

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

### 6. POST /amadeus/auth/verify - 验证授权

**用途**: 验证指定的 connectionId 是否已完成授权

**请求**:
```http
POST /api/amadeus/auth/verify
Content-Type: application/json

{
  "connectionId": "bee-iw40"
}
```

**请求参数**:

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| connectionId | string | ✅ | 连接 ID（从授权 URL 获取） | `"bee-iw40"` |

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

**错误响应示例**:

```json
{
  "success": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "connectionId 不能为空"
  }
}
```

---

## 💻 前端使用示例

### TypeScript/React 示例

```typescript
// api/amadeus.ts
const API_BASE_URL = '/api/amadeus';

export interface FlightSearchParams {
  originLocationCode: string;
  destinationLocationCode: string;
  departureDate: string;
  adults: number;
  returnDate?: string;
  children?: number;
  infants?: number;
  travelClass?: 'ECONOMY' | 'PREMIUM_ECONOMY' | 'BUSINESS' | 'FIRST';
  includedAirlineCodes?: string;
  excludedAirlineCodes?: string;
  nonStop?: boolean;
  currencyCode?: string;
  maxPrice?: number;
  max?: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}

export interface FlightOffer {
  type: string;
  id: string;
  source: string;
  instantTicketingRequired: boolean;
  nonHomogeneous: boolean;
  oneWay: boolean;
  lastTicketingDate: string;
  numberOfBookableSeats: number;
  itineraries: Array<{
    duration: string;
    segments: Array<{
      departure: {
        iataCode: string;
        terminal?: string;
        at: string;
      };
      arrival: {
        iataCode: string;
        terminal?: string;
        at: string;
      };
      carrierCode: string;
      number: string;
      aircraft?: {
        code: string;
      };
      duration: string;
      numberOfStops: number;
    }>;
  }>;
  price: {
    currency: string;
    total: string;
    base: string;
    fees?: Array<{
      amount: string;
      type: string;
    }>;
    grandTotal: string;
  };
  pricingOptions: {
    fareType: string[];
    includedCheckedBagsOnly: boolean;
  };
  validatingAirlineCodes: string[];
  travelerPricings: Array<{
    travelerId: string;
    fareOption: string;
    travelerType: string;
    price: {
      currency: string;
      total: string;
      base: string;
    };
    fareDetailsBySegment: Array<{
      segmentId: string;
      cabin: string;
      fareBasis: string;
      class: string;
      includedCheckedBags?: {
        quantity: number;
      };
    }>;
  }>;
}

export interface FlightSearchResponse {
  data: FlightOffer[];
  dictionaries: {
    locations: Record<string, { cityCode: string; countryCode: string }>;
    aircraft: Record<string, string>;
    currencies: Record<string, string>;
    carriers: Record<string, string>;
  };
  meta: {
    count: number;
    links: {
      self: string;
    };
  };
}

export async function searchFlights(
  params: FlightSearchParams
): Promise<FlightSearchResponse> {
  const response = await fetch(`${API_BASE_URL}/search/flights`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data: ApiResponse<FlightSearchResponse> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '搜索失败');
  }

  if (!data.data) {
    throw new Error('未返回数据');
  }

  return data.data;
}

export async function ping(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/ping`);
  const data: ApiResponse<{ structuredContent: { result: string } }> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'Ping 失败');
  }

  return data.data?.structuredContent?.result || 'pong';
}

export async function listTools(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/tools`);
  const data: ApiResponse<{ tools: any[] }> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '获取工具列表失败');
  }

  return data.data?.tools || [];
}

export async function checkAuthStatus(): Promise<{
  isAuthorized: boolean;
  isConnected: boolean;
  connectionId: string | null;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/status`);
  const data: ApiResponse<{
    isAuthorized: boolean;
    isConnected: boolean;
    connectionId: string | null;
  }> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '检查授权状态失败');
  }

  return data.data || {
    isAuthorized: false,
    isConnected: false,
    connectionId: null,
  };
}

export async function getAuthorizationUrl(): Promise<{
  authorizationUrl: string;
  connectionId: string;
}> {
  const response = await fetch(`${API_BASE_URL}/auth/url`);
  const data: ApiResponse<{
    authorizationUrl: string;
    connectionId: string;
  }> = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '获取授权 URL 失败');
  }

  if (!data.data) {
    throw new Error('未返回授权 URL');
  }

  return data.data;
}

export async function verifyAuthorization(
  connectionId: string
): Promise<{ isAuthorized: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ connectionId }),
  });

  const data: ApiResponse<{ isAuthorized: boolean; message: string }> =
    await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '验证授权失败');
  }

  if (!data.data) {
    throw new Error('未返回验证结果');
  }

  return data.data;
}
```

### React Hook 示例

```typescript
// hooks/useAmadeusSearch.ts
import { useState, useCallback } from 'react';
import {
  searchFlights,
  FlightSearchParams,
  FlightSearchResponse,
} from '../api/amadeus';

export function useAmadeusSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<FlightSearchResponse | null>(null);

  const search = useCallback(async (params: FlightSearchParams) => {
    setLoading(true);
    setError(null);

    try {
      const data = await searchFlights(params);
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

```typescript
// components/FlightSearch.tsx
import React, { useState } from 'react';
import { useAmadeusSearch } from '../hooks/useAmadeusSearch';
import { FlightSearchParams } from '../api/amadeus';

export function FlightSearch() {
  const { search, loading, error, results } = useAmadeusSearch();
  const [params, setParams] = useState<FlightSearchParams>({
    originLocationCode: 'SYD',
    destinationLocationCode: 'BKK',
    departureDate: '2026-05-02',
    adults: 1,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await search(params);
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            出发地 IATA 代码:
            <input
              type="text"
              value={params.originLocationCode}
              onChange={(e) =>
                setParams({ ...params, originLocationCode: e.target.value })
              }
              placeholder="SYD"
            />
          </label>
        </div>
        <div>
          <label>
            目的地 IATA 代码:
            <input
              type="text"
              value={params.destinationLocationCode}
              onChange={(e) =>
                setParams({ ...params, destinationLocationCode: e.target.value })
              }
              placeholder="BKK"
            />
          </label>
        </div>
        <div>
          <label>
            出发日期:
            <input
              type="date"
              value={params.departureDate}
              onChange={(e) =>
                setParams({ ...params, departureDate: e.target.value })
              }
            />
          </label>
        </div>
        <div>
          <label>
            成人数:
            <input
              type="number"
              min="1"
              max="9"
              value={params.adults}
              onChange={(e) =>
                setParams({ ...params, adults: parseInt(e.target.value) })
              }
            />
          </label>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? '搜索中...' : '搜索航班'}
        </button>
      </form>

      {error && <div style={{ color: 'red' }}>错误: {error}</div>}

      {results && (
        <div>
          <h3>搜索结果 ({results.meta.count} 个航班)</h3>
          {results.data.map((offer, index) => (
            <div key={offer.id || index} style={{ border: '1px solid #ccc', margin: '10px', padding: '10px' }}>
              <h4>航班 #{index + 1}</h4>
              <p>价格: {offer.price.currency} {offer.price.total}</p>
              <p>可预订座位: {offer.numberOfBookableSeats}</p>
              {offer.itineraries.map((itinerary, i) => (
                <div key={i}>
                  <p>行程 {i + 1}: {itinerary.duration}</p>
                  {itinerary.segments.map((segment, j) => (
                    <div key={j}>
                      <p>
                        {segment.departure.iataCode} → {segment.arrival.iataCode}
                      </p>
                      <p>
                        {new Date(segment.departure.at).toLocaleString()} -{' '}
                        {new Date(segment.arrival.at).toLocaleString()}
                      </p>
                      <p>航空公司: {segment.carrierCode} {segment.number}</p>
                      {segment.numberOfStops > 0 && (
                        <p>经停: {segment.numberOfStops} 次</p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## ⚠️ 注意事项

### 1. IATA 代码
- **必须使用机场的三字母 IATA 代码**，不是城市名称
- 常见示例：
  - `SYD` - 悉尼（Sydney）
  - `BKK` - 曼谷（Bangkok）
  - `JFK` - 纽约肯尼迪（New York JFK）
  - `LHR` - 伦敦希思罗（London Heathrow）
  - `PEK` - 北京首都（Beijing Capital）
  - `PVG` - 上海浦东（Shanghai Pudong）
- 可以通过 [IATA 机场代码查询](https://www.iata.org/en/publications/directories/code-search/) 查找正确的代码

### 2. 日期格式
- **必须使用 ISO 8601 格式**：`YYYY-MM-DD`
- 示例：`2026-05-02`（不是 `05/02/2026` 或 `2026-5-2`）
- 日期必须是未来日期（不能是过去的日期）

### 3. 人数限制
- **成人数**: 1-9 人（必填）
- **儿童数**: 0-9 人，且成人数 + 儿童数 ≤ 9
- **婴儿数**: 0-成人数（不能超过成人数）

### 4. 授权和配置
- **首次使用**: 可能需要完成 OAuth 授权（如果服务器需要）
- **Amadeus API 凭证**: 
  - 后端需要配置 Amadeus API 凭证才能使用搜索功能
  - 获取方式：访问 https://developers.amadeus.com/ 注册并创建应用
  - 配置方式：需要在 Smithery 平台上配置，或联系服务提供者
  - `ping` 工具不需要凭证，可以正常使用
- **Connection ID**: 授权完成后会自动保存，后续请求无需再次授权

### 5. API Key
- **后端需要设置 `SMITHERY_API_KEY` 环境变量**
- 前端无需关心 API Key，由后端统一管理

### 6. 错误处理
- **Configuration required**: 表示 Amadeus API 凭证未配置，需要在 Smithery 平台配置
- **OAuth authorization required**: 表示需要完成 OAuth 授权，调用 `/auth/url` 获取授权 URL
- **参数验证错误**: 检查请求参数是否符合要求（IATA 代码、日期格式、人数限制等）

### 7. 性能考虑
- **默认返回最多 250 个航班**，可以通过 `max` 参数限制返回数量
- **建议设置合理的 `max` 值**（例如 10-50）以提高响应速度
- **往返航班搜索**可能需要更长的响应时间

---

## 📚 相关文档

- [Amadeus 集成指南](./AMADEUS_INTEGRATION.md) - 完整集成文档
- [Amadeus 凭证配置指南](./AMADEUS_CREDENTIALS_TROUBLESHOOTING.md) - 凭证配置和故障排除
- [Amadeus 服务器设置指南](./AMADEUS_SERVER_SETTINGS_GUIDE.md) - Smithery 平台配置指南
- [Connect API 快速开始](./CONNECT_API_QUICKSTART.md) - Connect API 使用指南

---

## 🔗 相关链接

- [Amadeus for Developers](https://developers.amadeus.com/) - Amadeus API 官方文档
- [IATA 机场代码查询](https://www.iata.org/en/publications/directories/code-search/) - 查找机场 IATA 代码
- [Smithery - Amadeus MCP Server](https://smithery.ai/server/almogqwinz/mcp-amadeus-api) - 服务器页面

---

**状态**: ✅ 已实现并测试通过

**最后更新**: 2026-02-06
