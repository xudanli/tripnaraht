# 准备度 Pack 管理系统 CRUD 接口文档

## 概述

准备度 Pack 管理系统提供完整的 CRUD 接口，用于管理 Readiness Pack 数据。所有接口都需要 `/api` 前缀。

**基础路径**: `/api/readiness/admin/packs`

---

## 接口列表

### 1. 获取 Pack 列表（分页、筛选、搜索）

**接口**: `GET /api/readiness/admin/packs`

**请求参数**（Query）:

| 参数 | 类型 | 必填 | 说明 | 示例 |
|------|------|------|------|------|
| page | number | 否 | 页码，默认 1 | 1 |
| limit | number | 否 | 每页数量，默认 20 | 20 |
| countryCode | string | 否 | 国家代码筛选 | IS |
| destinationId | string | 否 | 目的地ID筛选 | IS-ICELAND |
| isActive | boolean | 否 | 是否激活筛选 | true |
| search | string | 否 | 搜索关键词（packId、displayName） | iceland |

**请求示例**:
```http
GET /api/readiness/admin/packs?page=1&limit=20&countryCode=IS&isActive=true
GET /api/readiness/admin/packs?search=iceland
```

**响应结构**:
```typescript
{
  success: true;
  data: {
    packs: ReadinessPackListItem[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error: null;
}
```

**ReadinessPackListItem 结构**:
```typescript
{
  id: string;                    // 数据库ID
  packId: string;                // Pack标识符（如 pack.is.iceland）
  destinationId: string;         // 目的地ID（如 IS-ICELAND）
  displayName: string;           // 显示名称（默认）
  displayNameEN?: string;        // 显示名称（英文）
  displayNameCN?: string;       // 显示名称（中文）
  version: string;               // 版本号
  lastReviewedAt: Date;         // 最后审核时间
  countryCode: string;           // 国家代码
  region?: string;              // 区域（默认）
  regionEN?: string;            // 区域（英文）
  regionCN?: string;             // 区域（中文）
  city?: string;                 // 城市（默认）
  cityEN?: string;              // 城市（英文）
  cityCN?: string;              // 城市（中文）
  isActive: boolean;            // 是否激活
  createdAt: Date;              // 创建时间
  updatedAt: Date;              // 更新时间
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "packs": [
      {
        "id": "uuid-here",
        "packId": "pack.is.iceland",
        "destinationId": "IS-ICELAND",
        "displayName": "Iceland Travel Readiness",
        "displayNameEN": "Iceland Travel Readiness",
        "displayNameCN": "冰岛旅行准备度",
        "version": "1.0.0",
        "lastReviewedAt": "2025-12-20T00:00:00.000Z",
        "countryCode": "IS",
        "region": "Iceland",
        "regionEN": "Iceland",
        "regionCN": "冰岛",
        "city": "Reykjavik",
        "cityEN": "Reykjavik",
        "cityCN": "雷克雅未克",
        "isActive": true,
        "createdAt": "2025-01-01T00:00:00.000Z",
        "updatedAt": "2025-01-01T00:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  },
  "error": null
}
```

---

### 2. 获取 Pack 详情

**接口**: `GET /api/readiness/admin/packs/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | Pack ID（packId），如 `pack.is.iceland` |

**查询参数**:

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| includePacking | boolean | 否 | 是否包含打包模板和指南 | true |

**请求示例**:
```http
GET /api/readiness/admin/packs/pack.is.iceland
GET /api/readiness/admin/packs/pack.is.iceland?includePacking=true
GET /api/readiness/admin/packs/pack.is.iceland?includePacking=false
```

**响应结构**:
```typescript
{
  success: true;
  data: ReadinessPack & {
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    packing?: {
      packingTemplate?: {
        version: string;
        lastUpdated: string;
        data: PackingChecklistTemplate;
      };
      packingGuide?: {
        version: string;
        lastUpdated: string;
        data: PackingGuide;
      };
    };
  };
  error: null;
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "packId": "pack.is.iceland",
    "destinationId": "IS-ICELAND",
    "displayName": "Iceland Travel Readiness",
    "version": "1.0.0",
    "lastReviewedAt": "2025-12-20T00:00:00.000Z",
    "geo": {
      "countryCode": "IS",
      "region": "Iceland",
      "city": "Reykjavik",
      "lat": 64.1265,
      "lng": -21.8174
    },
    "supportedSeasons": ["summer", "winter", "transition"],
    "sources": [...],
    "rules": [...],
    "checklists": [...],
    "hazards": [...],
    "packing": {
      "packingTemplate": {
        "version": "1.0.0",
        "lastUpdated": "2026-01-23T00:00:00.000Z",
        "data": {
          "metadata": {...},
          "quick_checklist_summer": {...},
          "quick_checklist_winter": {...},
          "packing_order_steps": [...],
          "pre_departure_final_checklist": {...}
        }
      },
      "packingGuide": {
        "version": "1.0.0",
        "lastUpdated": "2026-01-23T00:00:00.000Z",
        "data": {
          "metadata": {...},
          "layering_system": {...},
          "footwear": {...},
          "packing_tips": [...]
        }
      }
    },
    "isActive": true,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "error": null
}
```

**说明**:
- 如果 Pack 中已包含 `packing` 字段，则直接返回 Pack 中的打包数据
- 如果 Pack 中没有 `packing` 字段，且 `includePacking=true`（默认），系统会自动加载全局打包模板和指南
- 打包模板和指南数据来自 `packing_checklist_templates` 和 `packing_guides` 表中激活的最新版本
- **用户决策字段**: `rules[].then.userDecision` 字段包含结构化的用户问题和决策逻辑（详见"用户决策字段说明"章节）

---

### 3. 创建 Pack

**接口**: `POST /api/readiness/admin/packs`

**请求体**:
```typescript
{
  pack: ReadinessPack;  // 完整的 Pack 数据对象（可包含 packing 字段）
}
```

**请求示例**:
```json
{
  "pack": {
    "packId": "pack.is.iceland",
    "destinationId": "IS-ICELAND",
    "displayName": "Iceland Travel Readiness",
    "version": "1.0.0",
    "lastReviewedAt": "2025-12-20T00:00:00.000Z",
    "geo": {
      "countryCode": "IS",
      "region": "Iceland",
      "city": "Reykjavik",
      "lat": 64.1265,
      "lng": -21.8174
    },
    "supportedSeasons": ["summer", "winter", "transition"],
    "sources": [...],
    "rules": [...],
    "checklists": [...],
    "hazards": [...],
    "packing": {
      "packingTemplate": {
        "version": "1.0.0",
        "lastUpdated": "2026-01-23T00:00:00.000Z",
        "data": {...}
      },
      "packingGuide": {
        "version": "1.0.0",
        "lastUpdated": "2026-01-23T00:00:00.000Z",
        "data": {...}
      }
    }
  }
}
```

**说明**:
- `packing` 字段是可选的
- 如果未提供 `packing` 字段，系统会在获取 Pack 详情时自动加载全局模板
- 如果提供了 `packing` 字段，则使用 Pack 中指定的打包模板和指南（可用于目的地特定的定制）

**响应结构**:
```typescript
{
  success: true;
  data: ReadinessPack;  // 创建后的完整 Pack 数据
  error: null;
}
```

**错误响应**（如果 packId 已存在）:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Pack already exists"
  }
}
```

---

### 4. 更新 Pack

**接口**: `PUT /api/readiness/admin/packs/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | Pack ID（packId），如 `pack.is.iceland` |

**请求体**:
```typescript
{
  pack?: ReadinessPack;      // 可选的 Pack 数据（更新时提供）
  isActive?: boolean;        // 可选的激活状态
}
```

**请求示例**:
```json
{
  "pack": {
    "packId": "pack.is.iceland",
    "destinationId": "IS-ICELAND",
    "displayName": "Iceland Travel Readiness (Updated)",
    "version": "1.1.0",
    // ... 其他字段
  },
  "isActive": true
}
```

**或者只更新状态**:
```json
{
  "isActive": false
}
```

**响应结构**:
```typescript
{
  success: true;
  data: ReadinessPack & {
    id: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  error: null;
}
```

**错误响应**（如果 Pack 不存在）:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Readiness pack not found: pack.is.iceland"
  }
}
```

---

### 5. 删除 Pack（软删除）

**接口**: `DELETE /api/readiness/admin/packs/:id`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | Pack ID（packId），如 `pack.is.iceland` |

**说明**: 此接口执行软删除，将 `isActive` 设置为 `false`，不会真正删除数据库记录。

**请求示例**:
```http
DELETE /api/readiness/admin/packs/pack.is.iceland
```

**响应结构**:
```typescript
{
  success: true;
  data: {
    packId: string;
    deleted: boolean;
  };
  error: null;
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "packId": "pack.is.iceland",
    "deleted": true
  },
  "error": null
}
```

**错误响应**（如果 Pack 不存在）:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "Readiness pack not found: pack.is.iceland"
  }
}
```

---

## 数据导入接口（建议）

虽然当前没有专门的导入接口，但可以通过以下方式导入 JSON 文件：

### 方法 1: 使用创建接口

1. 读取 JSON 文件内容
2. 调用 `POST /api/readiness/admin/packs` 接口

**示例脚本**:
```typescript
import axios from 'axios';
import { readFileSync } from 'fs';

const packData = JSON.parse(readFileSync('src/trips/readiness/data/packs/pack.is.iceland.json', 'utf-8'));

const response = await axios.post('http://localhost:3000/api/readiness/admin/packs', {
  pack: packData
});

console.log(response.data);
```

### 方法 2: 使用后端服务方法（内部）

后端 `PackStorageService` 提供了导入方法：

```typescript
// 从文件导入
await packStorageService.importPackFromFile('src/trips/readiness/data/packs/pack.is.iceland.json');

// 从目录批量导入
await packStorageService.importPacksFromDirectory('src/trips/readiness/data/packs');
```

---

## 批量操作建议

### 批量导入多个 Pack

可以创建一个脚本批量导入：

```typescript
import axios from 'axios';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const packsDir = 'src/trips/readiness/data/packs';
const files = readdirSync(packsDir).filter(f => f.endsWith('.json'));

for (const file of files) {
  const filePath = join(packsDir, file);
  const packData = JSON.parse(readFileSync(filePath, 'utf-8'));
  
  try {
    const response = await axios.post('http://localhost:3000/api/readiness/admin/packs', {
      pack: packData
    });
    console.log(`✅ Imported: ${packData.packId}`);
  } catch (error: any) {
    if (error.response?.status === 400 && error.response?.data?.error?.message?.includes('already exists')) {
      console.log(`⚠️  Already exists: ${packData.packId}`);
    } else {
      console.error(`❌ Failed to import ${packData.packId}:`, error.message);
    }
  }
}
```

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|------------|------|
| NOT_FOUND | 404 | Pack 不存在 |
| VALIDATION_ERROR | 400 | 请求数据验证失败 |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

---

## 打包模板和指南集成

### 数据结构

ReadinessPack 现在支持可选的 `packing` 字段，包含打包模板和指南：

```typescript
interface PackingTemplateData {
  packingTemplate?: {
    version?: string;
    lastUpdated?: string;
    data: PackingChecklistTemplate;
  };
  packingGuide?: {
    version?: string;
    lastUpdated?: string;
    data: PackingGuide;
  };
}
```

### 使用方式

1. **自动加载（推荐）**: 
   - 如果 Pack 中没有 `packing` 字段，系统会自动从全局模板表加载
   - 获取 Pack 详情时默认包含打包数据（可通过 `includePacking=false` 禁用）

2. **自定义打包数据**:
   - 在创建或更新 Pack 时，可以在 `packing` 字段中提供目的地特定的打包模板和指南
   - 这样可以覆盖全局模板，为特定目的地提供定制化的打包建议

3. **全局模板管理**:
   - 全局打包模板存储在 `packing_checklist_templates` 表
   - 全局打包指南存储在 `packing_guides` 表
   - 系统会自动使用这些表中激活的最新版本
   - ⚠️ **注意**: 独立的打包模板和指南管理接口已删除，请通过 ReadinessPack 接口访问

### 数据来源优先级

1. Pack 中的 `packing` 字段（如果存在）
2. 全局模板表中的激活版本（如果 Pack 中没有）

### 接口变更

**已删除的接口**:
- ~~`GET /api/readiness/admin/packing-templates`~~ - 已删除
- ~~`GET /api/readiness/admin/packing-templates/:id`~~ - 已删除
- ~~`GET /api/readiness/admin/packing-templates/stats`~~ - 已删除
- ~~`GET /api/readiness/admin/packing-guides`~~ - 已删除
- ~~`GET /api/readiness/admin/packing-guides/:id`~~ - 已删除
- ~~`GET /api/readiness/admin/packing-guides/stats`~~ - 已删除

**推荐使用**:
- `GET /api/readiness/admin/packs/:id?includePacking=true` - 获取 Pack 详情（包含打包模板和指南）

---

## 用户决策接口（新增）

### 6. 回答用户决策问题

**接口**: `POST /api/readiness/trips/:tripId/decisions/:ruleId/answer`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| tripId | string | 是 | 行程ID |
| ruleId | string | 是 | 规则ID（如 `rule.ar.glacier-experience`） |

**请求体**:
```typescript
{
  answers: Record<string, any>;  // questionId -> answer
}
```

**请求示例**:
```json
{
  "answers": {
    "glacier_exp": "none",
    "glacier_equipment": ["crampons", "ice_axe"]
  }
}
```

**响应结构**:
```typescript
{
  success: true;
  data: {
    updatedFinding: {
      id: string;
      level: ActionLevel;
      message: string;
      blockTrip: boolean;
      tasks?: Task[];
      nextQuestions?: UserQuestion[];
    };
    gateResult: 'BLOCK' | 'ALLOW' | 'ADJUST_REQUIRED';
    constraints: Constraint[];
  };
  error: null;
}
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "updatedFinding": {
      "id": "rule.ar.glacier-experience",
      "level": "blocker",
      "message": "⚠️ 您必须预订带向导的旅游团。",
      "blockTrip": true,
      "tasks": [
        {
          "title": {
            "en": "Book glacier activity with licensed operator",
            "zh": "与持证运营商预订冰川活动"
          },
          "dueOffsetDays": -14,
          "tags": ["booking", "safety"]
        }
      ],
      "nextQuestions": []
    },
    "gateResult": "BLOCK",
    "constraints": [
      {
        "id": "rule.ar.glacier-experience",
        "type": "hard",
        "severity": "error",
        "category": "safety_blocker",
        "message": "⚠️ 您必须预订带向导的旅游团。"
      }
    ]
  },
  "error": null
}
```

**说明**:
- 此接口用于处理准备度规则中的用户决策问题
- 用户回答问题后，系统会根据决策分支重新评估规则级别
- 如果 `blockTrip = true`，会阻止行程生成（GateResult = BLOCK）
- 如果有 `nextQuestions`，表示还有后续问题需要回答

---

## 用户决策字段说明

### Action.userDecision（新增字段）

**结构**:
```typescript
interface UserDecision {
  questions: UserQuestion[];      // 需要问用户的问题列表
  branches?: DecisionBranch[];    // 基于用户回答的决策分支
  defaultBranch?: {               // 默认分支（当没有匹配的分支时使用）
    level?: ActionLevel;
    message?: LocalizedString;
    tasks?: Task[];
    blockTrip?: boolean;
  };
  askUser?: LocalizedString[];    // 向后兼容：简单问题列表
}
```

**UserQuestion 结构**:
```typescript
interface UserQuestion {
  id: string;                    // 问题唯一标识
  type: QuestionType;            // 问题类型：yes_no/single_choice/multiple_choice/text/number/date/rating
  question: LocalizedString;     // 问题文本
  description?: LocalizedString; // 问题描述（可选）
  required?: boolean;            // 是否必填（默认 true）
  options?: QuestionOption[];    // 选项（用于选择题）
  placeholder?: LocalizedString; // 占位符（用于文本/数字输入）
  validation?: {                 // 验证规则（用于数字/文本输入）
    min?: number;
    max?: number;
    pattern?: string;
    message?: LocalizedString;
  };
}
```

**DecisionBranch 结构**:
```typescript
interface DecisionBranch {
  condition: {
    questionId: string;          // 问题ID
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
    value: any;                   // 比较值
  };
  then: {
    level?: ActionLevel;          // 如果满足条件，调整的级别
    message?: LocalizedString;    // 如果满足条件，显示的消息
    tasks?: Task[];               // 如果满足条件，添加的任务
    blockTrip?: boolean;          // 是否阻止行程（默认 false）
    additionalQuestions?: UserQuestion[]; // 如果满足条件，继续问的问题
  };
}
```

**完整示例**:
```json
{
  "then": {
    "level": "blocker",
    "message": {
      "en": "⚠️ LAYER 1 RED LINE: Glacier activities require proper experience.",
      "zh": "⚠️ 第1层红线：冰川活动需要适当的经验。"
    },
    "userDecision": {
      "questions": [
        {
          "id": "glacier_exp",
          "type": "single_choice",
          "question": {
            "en": "What is your experience level with glacier activities?",
            "zh": "您对冰川活动的经验水平如何？"
          },
          "options": [
            {
              "value": "none",
              "label": {
                "en": "No experience",
                "zh": "无经验"
              }
            },
            {
              "value": "experienced",
              "label": {
                "en": "Experienced",
                "zh": "有经验"
              }
            }
          ],
          "required": true
        }
      ],
      "branches": [
        {
          "condition": {
            "questionId": "glacier_exp",
            "operator": "equals",
            "value": "none"
          },
          "then": {
            "level": "blocker",
            "blockTrip": true,
            "message": {
              "en": "⚠️ You must book a guided tour.",
              "zh": "⚠️ 您必须预订带向导的旅游团。"
            }
          }
        }
      ],
      "defaultBranch": {
        "level": "must",
        "message": {
          "en": "Ensure you have proper equipment.",
          "zh": "确保您有适当的装备。"
        }
      }
    }
  }
}
```

**向后兼容性**:
- `askUser` 字段仍然支持（简单问题列表格式）
- 如果同时提供了 `userDecision` 和 `askUser`，优先使用 `userDecision`
- 建议新创建的规则使用 `userDecision` 格式

---

## 验证和测试接口（新增）

### 7. 验证 Pack 数据

**接口**: `POST /api/readiness/admin/packs/validate`

**请求体**:
```typescript
{
  pack: ReadinessPack;  // 要验证的 Pack 数据
}
```

**响应结构**:
```typescript
{
  success: true;
  data: {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
    suggestions?: ValidationSuggestion[];
  };
  error: null;
}
```

**ValidationError 结构**:
```typescript
{
  path: string;        // 错误路径（如 "rules[0].id"）
  message: string;     // 错误消息
  code: string;        // 错误代码（如 "MISSING_FIELD"）
}
```

**使用场景**:
- 管理员编辑 Pack 后，在保存前验证数据格式
- 批量导入前验证所有 Pack
- 自动化测试中验证 Pack 数据

### 8. 测试 Pack 规则

**接口**: `POST /api/readiness/admin/packs/:id/test`

**路径参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | Pack ID（packId） |

**请求体**:
```typescript
{
  context: TripContext;  // 测试用的行程上下文
  userAnswers?: Record<string, any>;  // 可选的用户回答（用于测试决策分支）
}
```

**请求示例**:
```json
{
  "context": {
    "traveler": {
      "nationality": "CN",
      "riskTolerance": "medium"
    },
    "trip": {
      "startDate": "2026-07-01",
      "endDate": "2026-07-10"
    },
    "itinerary": {
      "countries": ["AR"],
      "activities": ["glacier-trekking", "hiking"],
      "season": "summer"
    }
  },
  "userAnswers": {
    "glacier_exp": "none"
  }
}
```

**响应结构**:
```typescript
{
  success: true;
  data: {
    triggeredRules: Rule[];  // 触发的规则列表
    findings: {
      blockers: ReadinessFindingItem[];
      must: ReadinessFindingItem[];
      should: ReadinessFindingItem[];
      optional: ReadinessFindingItem[];
    };
    gateResult: 'BLOCK' | 'ALLOW' | 'ADJUST_REQUIRED' | 'NEED_USER_CONFIRM';
    decisionLog: DecisionLogEntry[];
  };
  error: null;
}
```

**使用场景**:
- 管理员编辑规则后，测试规则是否正确触发
- 测试不同的用户回答，验证决策分支是否正确
- 测试不同场景（不同活动、季节等）

---

## 注意事项

1. **Pack ID 唯一性**: `packId` 必须唯一，如果已存在会返回错误
2. **软删除**: 删除操作是软删除，只设置 `isActive=false`，数据仍保留在数据库中
3. **数据验证**: 创建和更新时会验证 Pack 数据格式，确保必需字段存在
4. **版本管理**: 建议在更新时递增 `version` 字段
5. **权限控制**: 当前所有接口标记为 `@Public()`，生产环境应添加权限验证
6. **打包数据**: `packing` 字段是可选的，如果未提供，系统会自动加载全局模板
7. **用户决策**: `userDecision` 字段是可选的，用于实现基于用户回答的动态决策。如果提供了 `userDecision`，将优先使用它而不是 `askUser`
8. **验证工具**: 建议在保存 Pack 前使用验证接口检查数据格式
9. **测试工具**: 建议在发布 Pack 前使用测试工具验证规则逻辑

---

## 相关文件

- **Controller**: `src/trips/readiness/readiness.controller.ts` (1200-1473行)
- **DTO**: `src/trips/readiness/dto/admin-pack.dto.ts`
- **Service**: `src/trips/readiness/storage/pack-storage.service.ts`
- **类型定义**: `src/trips/readiness/types/readiness-pack.types.ts`
- **导入指南**: `src/trips/readiness/HOW_TO_ADD_PACK.md`
