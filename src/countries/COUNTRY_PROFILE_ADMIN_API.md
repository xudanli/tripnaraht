# 国家知识库（CountryProfile V2）管理接口文档

## 概述

管理后台对国家档案 `CountryProfile` 的增删改查。数据写入 Prisma，经 **Zod**（`countryProfileV2SeedSchema`）校验，与仓库内种子文件 `data/country-profiles/{ISO}.v2.json` 同构。

| 项目 | 说明 |
|------|------|
| 基础路径（推荐） | `/api/admin/countries` |
| 兼容路径 | `/api/countries/admin`（旧文档路径，仍可用） |
| Swagger 分组 | `countries-admin` |
| 公开读接口 | `GET /api/countries`、`GET /api/countries/:code/profile`（无需管理员） |

---

## 鉴权

所有本模块接口使用 **`AdminStrictAuthGuard`**（控制器 `@Public()` 跳过全局用户 JWT，由本 Guard 单独鉴权）。

任选其一：

1. **管理员 JWT**  
   `Authorization: Bearer <accessToken>`  
   用户须具备 **ADMIN** 或 **OPERATOR** 平台角色（JWT claim、`ADMIN_USER_IDS` / `OPERATOR_USER_IDS` 环境变量或 DB `users.platform_role`）。

2. **God Key**（环境变量 `ADMIN_GOD_API_KEY` 已配置时）  
   - Header：`x-admin-god-key: <key>`  
   - 或：`Authorization: Bearer <key>`

登录示例：`POST /api/admin/auth/login`（见 `ADMIN_API_GUIDE.md`）。

---

## 统一响应格式

```typescript
interface StandardResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;      // 如 NOT_FOUND | VALIDATION_ERROR | BUSINESS_ERROR | INTERNAL_ERROR
    message: string;
    details?: object;  // 校验失败时可能含 Zod issues
  };
}
```

---

## 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/profiles` | 分页列表 |
| POST | `/profiles/validate` | 校验 JSON（不落库） |
| GET | `/profiles/:isoCode` | 详情 |
| POST | `/profiles` | 创建 |
| PUT | `/profiles/:isoCode` | 全量更新 |
| PATCH | `/profiles/:isoCode` | 部分更新 |
| DELETE | `/profiles/:isoCode` | 硬删除 |

以下路径均省略前缀 `/api/admin/countries`（兼容路径将 `admin/countries` 换为 `countries/admin` 即可）。

---

## 1. 获取档案列表

`GET /profiles`

### Query 参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| page | number | 否 | 1 | 页码，≥1 |
| limit | number | 否 | 20 | 每页条数，最大 **100** |
| q | string | 否 | — | 搜索：中文名、英文名、ISO 代码 |

### 响应 `data`

```typescript
{
  items: Array<{
    isoCode: string;
    nameCN: string;
    nameEN: string | null;
    schemaVersion: number;
    currencyCode: string | null;
    currencyName: string | null;
    paymentType: string | null;
    exchangeRateToCNY: number | null;
    exchangeRateToUSD: number | null;
    updatedAt: string; // ISO 8601
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

### 示例

```http
GET /api/admin/countries/profiles?page=1&limit=20&q=冰岛
Authorization: Bearer <token>
```

---

## 2. 校验档案 JSON（不落库）

`POST /profiles/validate`

请求体与 **创建** 相同。通过 Zod 校验后返回摘要，不写入数据库。

### 响应 `data`

```json
{
  "valid": true,
  "isoCode": "IS",
  "schemaVersion": 2
}
```

### 失败

`success: false`，`error.code`: `VALIDATION_ERROR`，`details` 可能包含 Zod `issues`。

---

## 3. 获取档案详情

`GET /profiles/:isoCode`

`:isoCode` 为 ISO 3166-1 alpha-2（大小写不敏感，服务端会转大写）。

### 响应 `data`

与公开接口 `GET /api/countries/:countryCode/profile` 一致，V2 档案包含 `schemaVersion: 2`、`timeBoundaries` 等。字段见 [响应字段说明](#响应字段说明详情--创建--更新)。

### 错误

| code | 场景 |
|------|------|
| NOT_FOUND | 国家不存在 |

---

## 4. 创建档案

`POST /profiles`  
HTTP 状态码：**201**

### 请求体（必填字段）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| schemaVersion | `2` | 是 | 必须为字面量 `2` |
| isoCode | string | 是 | 2 位国家代码 |
| nameCN | string | 是 | 中文名 |
| nameEN | string | 否 | 英文名 |
| currencyCode | string | 否 | 如 `ISK` |
| currencyName | string | 否 | |
| exchangeRateToCNY | number | 否 | 1 外币 = ? CNY |
| exchangeRateToUSD | number | 否 | 1 外币 = ? USD |
| paymentType | enum | 否 | 见下表 |
| paymentInfo | object | 否 | 支付详情 |
| powerInfo | object | 否 | 插座、电压等 |
| emergency | object | 否 | 紧急电话 |
| visaForCN | object | 否 | 中国公民签证 |
| complianceInfo | object | 否 | 驾驶、无人机、生物安全等 |
| timeBoundaries | object | 否 | V2 季节/天候边界 |
| travelCulture | object | 否 | 小费、体验规则等 |

**paymentType 枚举**

| 值 | 说明 |
|----|------|
| `CASH_HEAVY` | 现金为主 |
| `BALANCED` | 混合 |
| `DIGITAL_ONLY` | 数字化为主 |
| `HYBRID_DIGITAL_PREFER` | 偏数字化（存库时映射 Prisma `BALANCED`，`paymentInfo.paymentProfile` 保留原值） |

### 错误

| code | 场景 |
|------|------|
| VALIDATION_ERROR | Zod 校验失败 |
| BUSINESS_ERROR | 该 `isoCode` 已存在 |

### 示例

```http
POST /api/countries/admin/profiles
Content-Type: application/json
Authorization: Bearer <token>

{
  "schemaVersion": 2,
  "isoCode": "IS",
  "nameCN": "冰岛",
  "nameEN": "Iceland",
  "currencyCode": "ISK",
  "paymentType": "DIGITAL_ONLY",
  "complianceInfo": {
    "drivingRules": { "drivingSide": "RIGHT" }
  }
}
```

完整示例见：`data/country-profiles/IS.v2.json`、`data/country-profiles/NZ.v2.json`。

---

## 5. 全量更新

`PUT /profiles/:isoCode`

- 请求体同 **创建**（完整 V2 对象）。
- **路径 `isoCode` 必须与 body.isoCode 一致**（忽略大小写）。
- 国家不存在 → `NOT_FOUND`。

---

## 6. 部分更新

`PATCH /profiles/:isoCode`

- 请求体字段**均可选**（`PatchCountryProfileAdminDto`）。
- **不允许修改 `isoCode`**（若 body 带不同 isoCode → `VALIDATION_ERROR`）。
- 标量字段：直接覆盖。
- JSON 对象字段（`paymentInfo`、`complianceInfo` 等）：与库中记录 **浅合并**。
- `complianceInfo.drivingRules`：**多一层深合并**（便于只改 ETA 系数等子字段）。
- 所有档案 **`schemaVersion` 恒为 2**（已废弃 V1）。

### 示例：只改汇率

```http
PATCH /api/countries/admin/profiles/IS
Content-Type: application/json

{
  "exchangeRateToCNY": 0.056
}
```

### 示例：合并驾驶规则

```http
PATCH /api/countries/admin/profiles/IS
Content-Type: application/json

{
  "complianceInfo": {
    "drivingRules": {
      "speedLimits": {
        "algorithmEtaPenaltyCoefficients": { "gravelRoad": 1.45 }
      }
    }
  }
}
```

---

## 7. 删除档案

`DELETE /profiles/:isoCode`

**硬删除**，不可恢复。

### 响应 `data`

```json
{
  "isoCode": "IS",
  "deleted": true
}
```

---

## 响应字段说明（详情 / 创建 / 更新）

```typescript
interface CountryProfileResponse {
  isoCode: string;
  nameCN: string;
  nameEN?: string;
  updatedAt: string;
  schemaVersion: 2;

  currencyCode?: string;
  currencyName?: string;
  exchangeRateToCNY?: number;
  exchangeRateToUSD?: number;
  paymentType?: string;          // 展示层可能为 HYBRID_DIGITAL_PREFER 等
  paymentInfo?: Record<string, unknown>;

  powerInfo?: Record<string, unknown>;
  emergency?: Record<string, unknown>;
  visaForCN?: Record<string, unknown>;
  complianceInfo?: Record<string, unknown>;
  travelCulture?: Record<string, unknown>;

  timeBoundaries?: {
    daylightFluctuation?: boolean;
    seasons?: Array<{
      name: string;
      months: number[];          // 1-12
      avgDaylightHours?: number;
      outdoorRoutingWindow?: { start: string; end: string };
      recommendedCarType?:
        | 'ANY' | '2WD' | '4WD_SUV' | '4WD_SUV_STUDDED_TIRES' | '2WD_WITH_SNOW_CHAINS_OR_4WD';
    }>;
    environmentalTriggers?: {
      weatherAlertSource?: string;  // URL
      roadStatusSource?: string;    // URL
      autoRerouteTriggers?: string[];
    };
  };
}
```

### complianceInfo 常用子结构（算法消费）

- `drivingRules.drivingSide`: `LEFT` | `RIGHT`
- `drivingRules.speedLimits.algorithmEtaPenaltyCoefficients`: 路线 ETA 惩罚系数
- `drivingRules.leftHandDrivingEtaBuffer`: 左舵习惯缓冲（0–1）
- `biosecurityPolicy`: 新西兰等生物安全
- `droneRules`: 无人机限制

详见类型：`src/countries/types/country-profile-v2.types.ts`。

---

## timeBoundaries 校验要点

| 字段 | 约束 |
|------|------|
| `seasons[].months` | 整数 1–12 |
| `environmentalTriggers.*Source` | 须为合法 URL |
| `recommendedCarType` | 枚举见上 |

---

## 错误码一览

| error.code | HTTP | 典型原因 |
|------------|------|----------|
| NOT_FOUND | 200* | 国家代码不存在 |
| VALIDATION_ERROR | 200* | Zod/业务校验失败 |
| BUSINESS_ERROR | 200* | 创建时 isoCode 已存在 |
| INTERNAL_ERROR | 200* | 服务端异常 |

\* 业务错误仍返回 JSON body，`success: false`；未授权由 Guard 抛 **401/403**（非上述 envelope）。

---

## 与公开接口的关系

| 能力 | 管理接口 | 公开接口 |
|------|----------|----------|
| 列表（精简） | `GET .../admin/profiles` | `GET /api/countries` |
| 详情（完整） | `GET .../admin/profiles/:iso` | `GET /api/countries/:iso/profile` |
| 写入 | POST / PUT / PATCH / DELETE | 无 |

下游消费：`CountryKnowledgeService`（路线 ETA）、`FactsToReadinessCompiler`（无 ReadinessPack 时回退）。

---

## 命令行种子（运维备选）

```bash
npx ts-node -r tsconfig-paths/register scripts/seed-country-profile-v2.ts IS NZ
```

与 HTTP 创建使用同一套 Zod + `seedV2ToPrismaUpdate` 映射。

---

## 实现索引

| 文件 | 职责 |
|------|------|
| `countries-admin.controller.ts` | 路由 |
| `countries-admin.service.ts` | CRUD 逻辑 |
| `dto/country-profile-admin.dto.ts` | 请求 DTO |
| `schemas/country-profile-v2.zod.ts` | Zod 校验 |
| `country-profile-v2.mapper.ts` | Prisma 映射、PATCH 合并 |
