# Google Calendar MCP 前端 API 文档

## 📋 概述

本文档说明如何在前端使用 Google Calendar MCP 服务进行日历事件管理和行程同步。

**Base URL**: `/api/google-calendar`

**认证**: 当前所有接口均为公开接口（`@Public()`），生产环境可能需要添加认证。

**服务器**: 使用 Google Calendar MCP 服务器 (`https://server.smithery.ai/googlecalendar`)，提供以下功能：
- ✅ 列出日历 (`list_calendars`)
- ✅ 列出事件 (`events_list`)
- ✅ 创建事件 (`create_event`)
- ✅ 更新事件 (`update_event`)
- ✅ 删除事件 (`delete_event`)
- ✅ 查找事件 (`find_event`)
- ✅ 查找空闲时间段 (`find_free_slots`)
- ✅ 快速添加事件 (`quick_add`)
- ✅ 行程同步 (`syncTripToCalendar`, `deleteTripEvents`)

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
- `NOT_FOUND`: 资源不存在

---

## 🎯 API 端点

**接口列表**:
1. [GET /google-calendar/tools - 列出所有可用工具](#1-get-google-calendartools---列出所有可用工具)
2. [GET /google-calendar/calendars - 列出所有日历](#2-get-google-calendarcalendars---列出所有日历)
3. [GET /google-calendar/events - 列出日历事件](#3-get-google-calendarevents---列出日历事件)
4. [POST /google-calendar/events - 创建日历事件](#4-post-google-calendarevents---创建日历事件)
5. [POST /google-calendar/events/:eventId/update - 更新日历事件](#5-post-google-calendareventseventidupdate---更新日历事件)
6. [POST /google-calendar/events/:eventId/delete - 删除日历事件](#6-post-google-calendareventseventiddelete---删除日历事件)
7. [POST /google-calendar/events/find - 查找日历事件](#7-post-google-calendareventsfind---查找日历事件)
8. [POST /google-calendar/free-slots - 查找空闲时间段](#8-post-google-calendarfree-slots---查找空闲时间段)
9. [POST /google-calendar/quick-add - 快速添加事件](#9-post-google-calendarquick-add---快速添加事件)
10. [GET /google-calendar/current-time - 获取当前日期时间](#10-get-google-calendarcurrent-time---获取当前日期时间)
11. [POST /google-calendar/trips/:tripId/sync - 同步行程到日历](#11-post-google-calendartripstripid sync---同步行程到日历) ⭐ 新增
12. [POST /google-calendar/trips/:tripId/delete-events - 删除行程的所有日历事件](#12-post-google-calendartripstripiddelete-events---删除行程的所有日历事件) ⭐ 新增

---

### 1. GET /google-calendar/tools - 列出所有可用工具

**用途**: 获取 Google Calendar MCP 服务器提供的所有工具列表

**请求**:
```http
GET /api/google-calendar/tools
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "list_calendars",
        "description": "List all calendars"
      },
      {
        "name": "events_list",
        "description": "List calendar events"
      },
      {
        "name": "create_event",
        "description": "Create a calendar event"
      }
    ]
  }
}
```

---

### 2. GET /google-calendar/calendars - 列出所有日历

**用途**: 获取用户的所有日历列表

**请求**:
```http
GET /api/google-calendar/calendars
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "calendars": [
      {
        "id": "primary",
        "summary": "我的日历",
        "primary": true,
        "timeZone": "Asia/Shanghai"
      },
      {
        "id": "calendar-id-123",
        "summary": "工作日历",
        "primary": false,
        "timeZone": "Asia/Shanghai"
      }
    ]
  }
}
```

---

### 3. GET /google-calendar/events - 列出日历事件

**用途**: 根据条件列出日历事件

**请求**:
```http
GET /api/google-calendar/events?calendarId=primary&timeMin=2026-02-01T00:00:00Z&timeMax=2026-02-28T23:59:59Z&maxResults=10
```

**查询参数**:
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| calendarId | string | ❌ | 日历 ID（默认: primary） | `"primary"` |
| timeMin | string | ❌ | 开始时间（ISO 8601） | `"2026-02-01T00:00:00Z"` |
| timeMax | string | ❌ | 结束时间（ISO 8601） | `"2026-02-28T23:59:59Z"` |
| maxResults | number | ❌ | 最大结果数 | `10` |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "event-id-123",
        "summary": "黄金瀑布",
        "start": {
          "dateTime": "2026-02-07T10:00:00+00:00",
          "timeZone": "Atlantic/Reykjavik"
        },
        "end": {
          "dateTime": "2026-02-07T12:00:00+00:00",
          "timeZone": "Atlantic/Reykjavik"
        },
        "description": "行程: 冰岛环岛之旅\n地点: 黄金瀑布",
        "location": "Iceland"
      }
    ]
  }
}
```

---

### 4. POST /google-calendar/events - 创建日历事件

**用途**: 创建一个新的日历事件

**请求**:
```http
POST /api/google-calendar/events
Content-Type: application/json

{
  "calendarId": "primary",
  "summary": "黄金瀑布",
  "start": {
    "dateTime": "2026-02-07T10:00:00+00:00",
    "timeZone": "Atlantic/Reykjavik"
  },
  "end": {
    "dateTime": "2026-02-07T12:00:00+00:00",
    "timeZone": "Atlantic/Reykjavik"
  },
  "description": "参观冰岛著名的黄金瀑布",
  "location": "Iceland"
}
```

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| calendarId | string | ❌ | 日历 ID（默认: primary） | `"primary"` |
| summary | string | ✅ | 事件标题 | `"黄金瀑布"` |
| start | object | ✅ | 开始时间 | `{ "dateTime": "2026-02-07T10:00:00+00:00", "timeZone": "Atlantic/Reykjavik" }` 或 `{ "date": "2026-02-07" }` |
| end | object | ✅ | 结束时间 | `{ "dateTime": "2026-02-07T12:00:00+00:00", "timeZone": "Atlantic/Reykjavik" }` 或 `{ "date": "2026-02-07" }` |
| description | string | ❌ | 事件描述 | `"参观冰岛著名的黄金瀑布"` |
| location | string | ❌ | 事件位置 | `"Iceland"` |
| attendees | string[] | ❌ | 参与者邮箱列表 | `["user@example.com"]` |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "event-id-123",
    "summary": "黄金瀑布",
    "start": {
      "dateTime": "2026-02-07T10:00:00+00:00",
      "timeZone": "Atlantic/Reykjavik"
    },
    "end": {
      "dateTime": "2026-02-07T12:00:00+00:00",
      "timeZone": "Atlantic/Reykjavik"
    }
  }
}
```

---

### 5. POST /google-calendar/events/:eventId/update - 更新日历事件

**用途**: 更新指定的日历事件

**请求**:
```http
POST /api/google-calendar/events/event-id-123/update
Content-Type: application/json

{
  "calendarId": "primary",
  "summary": "黄金瀑布（已更新）",
  "start": {
    "dateTime": "2026-02-07T11:00:00+00:00",
    "timeZone": "Atlantic/Reykjavik"
  },
  "end": {
    "dateTime": "2026-02-07T13:00:00+00:00",
    "timeZone": "Atlantic/Reykjavik"
  }
}
```

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| eventId | string | ✅ | 事件 ID |

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| calendarId | string | ✅ | 日历 ID |
| summary | string | ❌ | 事件标题 |
| start | object | ❌ | 开始时间 |
| end | object | ❌ | 结束时间 |
| description | string | ❌ | 事件描述 |
| location | string | ❌ | 事件位置 |

---

### 6. POST /google-calendar/events/:eventId/delete - 删除日历事件

**用途**: 删除指定的日历事件

**请求**:
```http
POST /api/google-calendar/events/event-id-123/delete
Content-Type: application/json

{
  "calendarId": "primary"
}
```

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| eventId | string | ✅ | 事件 ID |

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| calendarId | string | ✅ | 日历 ID |

---

### 7. POST /google-calendar/events/find - 查找日历事件

**用途**: 根据查询条件查找日历事件

**请求**:
```http
POST /api/google-calendar/events/find
Content-Type: application/json

{
  "calendarId": "primary",
  "query": "黄金瀑布",
  "timeMin": "2026-02-01T00:00:00Z",
  "timeMax": "2026-02-28T23:59:59Z"
}
```

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| calendarId | string | ❌ | 日历 ID（默认: primary） |
| query | string | ❌ | 搜索查询 |
| timeMin | string | ❌ | 开始时间（ISO 8601） |
| timeMax | string | ❌ | 结束时间（ISO 8601） |

---

### 8. POST /google-calendar/free-slots - 查找空闲时间段

**用途**: 查找指定时间范围内的空闲时间段

**请求**:
```http
POST /api/google-calendar/free-slots
Content-Type: application/json

{
  "calendarId": "primary",
  "timeMin": "2026-02-07T00:00:00Z",
  "timeMax": "2026-02-07T23:59:59Z",
  "durationMinutes": 60
}
```

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| calendarId | string | ❌ | 日历 ID（默认: primary） | `"primary"` |
| timeMin | string | ✅ | 开始时间（ISO 8601） | `"2026-02-07T00:00:00Z"` |
| timeMax | string | ✅ | 结束时间（ISO 8601） | `"2026-02-07T23:59:59Z"` |
| durationMinutes | number | ❌ | 持续时间（分钟，默认: 60） | `60` |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "freeSlots": [
      {
        "start": "2026-02-07T09:00:00Z",
        "end": "2026-02-07T10:00:00Z"
      },
      {
        "start": "2026-02-07T14:00:00Z",
        "end": "2026-02-07T15:00:00Z"
      }
    ]
  }
}
```

---

### 9. POST /google-calendar/quick-add - 快速添加事件

**用途**: 使用自然语言快速添加日历事件

**请求**:
```http
POST /api/google-calendar/quick-add
Content-Type: application/json

{
  "calendarId": "primary",
  "text": "明天下午2点开会"
}
```

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| calendarId | string | ❌ | 日历 ID（默认: primary） |
| text | string | ✅ | 自然语言描述 |

---

### 10. GET /google-calendar/current-time - 获取当前日期时间

**用途**: 获取当前日期时间（用于测试连接）

**请求**:
```http
GET /api/google-calendar/current-time
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "dateTime": "2026-02-06T12:34:56Z",
    "timeZone": "UTC"
  }
}
```

---

### 11. POST /google-calendar/trips/:tripId/sync - 同步行程到日历 ⭐ 新增

**用途**: 将 TripNara 行程同步到用户的 Google Calendar

**请求**:
```http
POST /api/google-calendar/trips/trip-123/sync
Content-Type: application/json

{
  "userId": "user-123",
  "calendarId": "primary"
}
```

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| tripId | string | ✅ | 行程 ID |

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| userId | string | ✅ | 用户 ID |
| calendarId | string | ❌ | 目标日历 ID（默认: primary） |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "eventsCreated": 5,
    "eventsUpdated": 2,
    "eventsDeleted": 1,
    "errors": []
  }
}
```

**响应字段说明**:
- `success`: 是否成功
- `eventsCreated`: 创建的事件数量
- `eventsUpdated`: 更新的事件数量
- `eventsDeleted`: 删除的事件数量
- `errors`: 错误列表

---

### 12. POST /google-calendar/trips/:tripId/delete-events - 删除行程的所有日历事件 ⭐ 新增

**用途**: 删除指定行程的所有日历事件

**请求**:
```http
POST /api/google-calendar/trips/trip-123/delete-events
Content-Type: application/json

{
  "userId": "user-123"
}
```

**路径参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| tripId | string | ✅ | 行程 ID |

**请求参数**:
| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| userId | string | ✅ | 用户 ID |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "eventsCreated": 0,
    "eventsUpdated": 0,
    "eventsDeleted": 5,
    "errors": []
  }
}
```

---

## 💻 前端使用示例

### TypeScript/React 示例

```typescript
// api/google-calendar.ts
const API_BASE_URL = '/api/google-calendar';

export interface CreateEventParams {
  calendarId?: string;
  summary: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  description?: string;
  location?: string;
  attendees?: string[];
}

export interface SyncTripParams {
  userId: string;
  calendarId?: string;
}

export async function syncTripToCalendar(
  tripId: string,
  params: SyncTripParams
): Promise<SyncTripResult> {
  const response = await fetch(`${API_BASE_URL}/trips/${tripId}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '同步失败');
  }

  return data.data;
}

export async function createCalendarEvent(params: CreateEventParams) {
  const response = await fetch(`${API_BASE_URL}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '创建事件失败');
  }

  return data.data;
}

export async function findFreeSlots(
  timeMin: string,
  timeMax: string,
  durationMinutes: number = 60,
  calendarId?: string
) {
  const response = await fetch(`${API_BASE_URL}/free-slots`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      calendarId,
      timeMin,
      timeMax,
      durationMinutes,
    }),
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error?.message || '查找空闲时间段失败');
  }

  return data.data;
}
```

### React Hook 示例

```typescript
// hooks/useGoogleCalendarSync.ts
import { useState, useCallback } from 'react';
import { syncTripToCalendar, SyncTripParams, SyncTripResult } from '../api/google-calendar';

export function useGoogleCalendarSync() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncTripResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async (tripId: string, params: SyncTripParams) => {
    setLoading(true);
    setError(null);
    
    try {
      const syncResult = await syncTripToCalendar(tripId, params);
      setResult(syncResult);
      return syncResult;
    } catch (err: any) {
      setError(err.message || '同步失败');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    sync,
    loading,
    result,
    error,
  };
}
```

### React 组件示例

```tsx
// components/TripCalendarSync.tsx
import React, { useState } from 'react';
import { useGoogleCalendarSync } from '../hooks/useGoogleCalendarSync';

interface Props {
  tripId: string;
  userId: string;
}

export function TripCalendarSync({ tripId, userId }: Props) {
  const { sync, loading, result, error } = useGoogleCalendarSync();
  const [calendarId, setCalendarId] = useState<string>('primary');

  const handleSync = async () => {
    try {
      await sync(tripId, { userId, calendarId });
      alert('同步成功！');
    } catch (err) {
      alert(`同步失败: ${err.message}`);
    }
  };

  return (
    <div>
      <h3>同步到 Google Calendar</h3>
      <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
        <option value="primary">主日历</option>
      </select>
      <button onClick={handleSync} disabled={loading}>
        {loading ? '同步中...' : '同步到日历'}
      </button>
      
      {result && (
        <div>
          <p>✅ 创建: {result.eventsCreated} 个事件</p>
          <p>🔄 更新: {result.eventsUpdated} 个事件</p>
          <p>🗑️ 删除: {result.eventsDeleted} 个事件</p>
          {result.errors.length > 0 && (
            <div>
              <p>❌ 错误:</p>
              <ul>
                {result.errors.map((err, i) => (
                  <li key={i}>{err.itemId}: {err.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      {error && <div className="error">{error}</div>}
    </div>
  );
}
```

---

## 🔐 OAuth 认证

### 认证流程

Google Calendar MCP 使用 OAuth 2.0 认证。首次使用时需要完成授权：

1. **检查授权状态**: 调用任何 API 时，如果未授权会返回错误
2. **完成授权**: 根据错误信息中的授权 URL 完成 OAuth 流程
3. **Token 存储**: 授权完成后，token 会自动保存在 `~/.tripnara-mcp/googlecalendar-tokens.json`
4. **后续使用**: 授权完成后，后续请求会自动使用保存的 token

### 授权状态检查

```typescript
// 尝试调用 API，如果未授权会返回错误
try {
  await syncTripToCalendar(tripId, { userId });
} catch (error) {
  if (error.message.includes('OAuth') || error.message.includes('authorization')) {
    // 需要授权，引导用户完成 OAuth 流程
    console.log('需要完成 Google Calendar 授权');
  }
}
```

---

## ⚠️ 注意事项

1. **OAuth 认证**: 
   - 首次使用可能需要完成 OAuth 认证
   - 如果返回 OAuth 相关错误，需要完成授权流程
   - 认证完成后，token 会自动保存，后续无需再次认证

2. **错误处理**: 
   - 所有接口都返回统一的响应格式
   - 检查 `success` 字段判断是否成功
   - 失败时查看 `error` 字段获取错误信息

3. **时区处理**: 
   - 创建事件时建议指定 `timeZone`
   - 如果不指定，会使用日历的默认时区

4. **事件映射**: 
   - 行程同步后，系统会保存行程项与日历事件的映射关系
   - 更新行程时，会自动更新对应的日历事件
   - 删除行程时，会自动删除对应的日历事件

---

## 📚 相关文档

- [Google Calendar MCP 集成文档](./GOOGLE_CALENDAR_INTEGRATION.md)
- [Google Calendar 产品策略](./GOOGLE_CALENDAR_PRODUCT_STRATEGY.md)
- [Google Calendar 快速开始](./GOOGLE_CALENDAR_QUICKSTART.md)

---

**状态**: ✅ 已实现并测试通过

**最后更新**: 2026-02-06  
**更新内容**: 
- ✅ 新增行程同步端点：`POST /google-calendar/trips/:tripId/sync`
- ✅ 新增删除行程事件端点：`POST /google-calendar/trips/:tripId/delete-events`
- ✅ 添加前端使用示例和 React Hook
