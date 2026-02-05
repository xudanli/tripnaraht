# 行程名称字段新增功能 PRD

## 0.1 项目背景与问题定义（Why Now）

### 背景
当前 TripNARA 系统中的行程（Trip）模型缺少**行程名称**字段。用户在创建和管理多个行程时，仅能通过目的地国家代码、日期范围等基础信息来区分行程，导致：

1. **用户体验问题**：
   - 行程列表页面无法快速识别不同行程（如"冰岛环岛游"、"冰岛高地探险"）
   - 分享行程时缺少有意义的标题
   - 历史行程回顾时难以记忆和查找

2. **产品功能限制**：
   - 无法支持用户自定义行程标题
   - 无法基于行程名称进行搜索和筛选
   - 行程分享链接缺少友好的标题展示

### 问题定义
**核心问题**：Trip 数据模型缺少用户可读的行程名称字段，影响用户体验和产品功能完整性。

**为什么现在做**：
- 这是基础功能，应该在产品早期完善
- 用户反馈中多次提到"行程列表难以区分"
- 为后续功能（如行程搜索、智能命名）打下基础

---

## 0.2 目标与成功指标（North Star & Metrics）

### 目标
**主要目标**：为 Trip 模型新增 `name` 字段，支持用户创建、编辑和查看行程名称。

**次要目标**：
- 向后兼容：已有行程自动生成默认名称
- 前端展示：行程列表和详情页显示名称
- API 支持：创建和更新接口支持名称字段

### 成功指标

**北极星指标**：
- 90% 的新创建行程包含用户自定义名称（非默认名称）

**过程指标**：
- 行程创建时名称填写率 ≥ 80%
- 行程更新时名称修改率 ≥ 30%
- API 调用中 `name` 字段使用率 ≥ 70%

**质量指标**：
- 名称字段平均长度：10-50 字符
- 名称唯一性：同一用户行程名称重复率 < 20%
- API 响应时间增加 < 50ms（字段查询开销）

---

## 0.3 用户与场景（Persona / JTBD / User Journey）

### 用户画像

**主要用户**：
- **旅行规划者**：经常创建多个行程，需要区分不同旅行计划
- **行程分享者**：需要为分享的行程设置有意义的标题
- **历史回顾者**：需要通过名称快速找到过去的行程

### 用户旅程

**场景 1：创建新行程**
1. 用户点击"创建行程"
2. 填写目的地、日期、预算等信息
3. **新增**：填写行程名称（如"2025年冰岛环岛游"）
4. 系统保存行程，名称显示在行程列表中

**场景 2：编辑已有行程**
1. 用户进入行程详情页
2. 点击"编辑"按钮
3. **新增**：修改行程名称
4. 保存后，名称更新到所有相关页面

**场景 3：查看行程列表**
1. 用户进入"我的行程"页面
2. **新增**：看到每个行程的名称（如"冰岛环岛游"、"日本关西7日游"）
3. 通过名称快速识别和选择行程

**场景 4：分享行程**
1. 用户点击"分享行程"
2. **新增**：分享链接的标题显示行程名称（而非仅显示目的地代码）

---

## 0.4 需求范围（In/Out）与约束

### 功能范围（In Scope）

**P0（必须）**：
1. ✅ 数据库：Trip 表新增 `name` 字段（String，可选，最大长度 200）
2. ✅ DTO：`CreateTripDto` 和 `UpdateTripDto` 新增 `name` 字段
3. ✅ Service：创建和更新行程时处理 `name` 字段
4. ✅ API：`GET /trips/:id` 返回 `name` 字段
5. ✅ 默认值：已有行程自动生成默认名称（格式：`{destination} {startDate}`）

**P1（重要）**：
1. ✅ API：`GET /trips/user/:userId` 返回列表时包含 `name`
2. ✅ 数据迁移：为已有行程生成默认名称
3. ✅ 验证：名称长度限制（1-200 字符）
4. ✅ 前端：行程列表和详情页显示名称

**P2（可选）**：
1. ⏸️ 智能命名：基于目的地和日期自动生成建议名称
2. ⏸️ 名称搜索：支持按名称搜索行程
3. ⏸️ 名称唯一性校验：同一用户行程名称不能重复

### 功能边界（Out of Scope）

**明确不做**：
- ❌ 多语言名称支持（仅支持单语言，用户可自行使用中英文）
- ❌ 名称历史记录（不支持名称变更历史）
- ❌ 名称模板系统（不支持预设模板）
- ❌ 名称自动翻译（不支持多语言自动翻译）

### 约束条件

**数据约束**：
- 名称长度：1-200 字符
- 名称类型：String（UTF-8，支持中英文、emoji）
- 必填性：可选字段（创建时可省略，系统自动生成默认值）
- 唯一性：不强制唯一（允许用户有多个同名行程）

**技术约束**：
- 数据库迁移：需要兼容已有数据（已有行程自动生成默认名称）
- API 兼容性：新增字段为可选，不影响现有 API 调用
- 性能：字段查询不应显著影响 API 响应时间

**合规约束**：
- 内容审核：名称内容需符合社区规范（暂不实现自动审核，后续可扩展）

---

## 0.5 竞品与对标

### 竞品分析

**参考产品**：
- **TripIt**：行程名称支持自定义，默认使用"Trip to {destination}"
- **Google Trips**：使用目的地和日期组合作为名称
- **Wanderlog**：支持自定义行程名称，支持 emoji

**最佳实践**：
- 默认名称格式：`{destination} {startDate}` 或 `{destination} Trip`
- 支持 emoji 和特殊字符
- 名称长度限制：通常 50-100 字符

---

## 0.6 总体方案概览

### 端到端流程

```
用户输入名称
    ↓
前端验证（长度、格式）
    ↓
API 请求（CreateTripDto / UpdateTripDto）
    ↓
后端验证（Service 层）
    ↓
数据库保存（Trip.name）
    ↓
返回响应（包含 name 字段）
    ↓
前端展示（列表页、详情页）
```

### 数据流

**创建行程**：
```
POST /trips
{
  "destination": "IS",
  "startDate": "2025-06-01",
  "endDate": "2025-06-10",
  "name": "冰岛环岛游"  // 新增字段
}
→ Trip.name = "冰岛环岛游"
```

**更新行程**：
```
PUT /trips/:id
{
  "name": "冰岛环岛游（修改版）"  // 新增字段
}
→ Trip.name = "冰岛环岛游（修改版）"
```

**查询行程**：
```
GET /trips/:id
→ {
  "id": "...",
  "name": "冰岛环岛游",  // 新增字段
  "destination": "IS",
  ...
}
```

---

## 0.7 关键流程（用户流 + 系统流 + 异常流）

### 用户流程

**创建行程流程**：
1. 用户填写行程信息（目的地、日期、预算等）
2. **新增**：用户填写行程名称（可选）
3. 用户点击"创建"
4. 系统验证名称长度（1-200 字符）
5. 如果未填写名称，系统自动生成默认名称
6. 保存行程，返回包含名称的响应
7. 前端显示新创建的行程（带名称）

**更新行程流程**：
1. 用户进入行程详情页
2. 用户点击"编辑"
3. **新增**：用户修改行程名称
4. 用户点击"保存"
5. 系统验证并更新名称
6. 返回更新后的行程数据
7. 前端刷新显示新名称

### 系统流程

**创建行程系统流程**：
```
1. Controller 接收 CreateTripDto
2. 验证 name 字段（如果提供）：
   - 长度：1-200 字符
   - 类型：String
3. 如果 name 为空或未提供：
   - 生成默认名称：`${destination} ${startDate}`
4. Service.create() 保存 Trip：
   - name: dto.name || defaultName
5. 返回 Trip 对象（包含 name）
```

**更新行程系统流程**：
```
1. Controller 接收 UpdateTripDto（Partial）
2. 如果 dto.name 存在：
   - 验证长度：1-200 字符
   - 更新 Trip.name = dto.name
3. Service.update() 更新 Trip
4. 返回更新后的 Trip（包含 name）
```

### 异常流程

**异常情况处理**：

1. **名称过长**（> 200 字符）：
   - 返回 400 Bad Request
   - 错误信息：`"行程名称长度不能超过 200 字符"`

2. **名称为空字符串**：
   - 自动生成默认名称
   - 不返回错误（视为未提供名称）

3. **名称包含非法字符**：
   - 暂不限制（允许 emoji、特殊字符）
   - 后续可扩展内容审核

4. **数据库迁移失败**：
   - 回滚迁移
   - 记录错误日志
   - 通知运维团队

5. **已有行程 name 为 null**：
   - 查询时自动生成默认名称（不写入数据库）
   - 或通过数据迁移脚本批量更新

---

## 0.8 核心能力：数据模型与字段字典

### 数据模型变更

**Prisma Schema 变更**：
```prisma
model Trip {
  id                     String                   @id
  name                   String?                  // 新增：行程名称（可选）
  destination            String
  startDate              DateTime
  endDate                DateTime
  status                 String?                  @default("PLANNING")
  budgetConfig           Json?
  pacingConfig           Json?
  createdAt              DateTime                 @default(now())
  updatedAt              DateTime
  metadata               Json?
  // ... 其他字段
}
```

**字段定义**：
- **字段名**：`name`
- **类型**：`String?`（可选）
- **最大长度**：200 字符
- **默认值**：`null`（创建时如果未提供，系统生成默认名称）
- **索引**：不需要单独索引（查询通常通过 `id` 或 `userId`）

### DTO 变更

**CreateTripDto 新增字段**：
```typescript
export class CreateTripDto {
  // ... 现有字段
  
  @ApiPropertyOptional({
    description: '行程名称（1-200 字符）',
    example: '冰岛环岛游',
    maxLength: 200,
    minLength: 1,
  })
  @IsOptional()
  @IsString({ message: 'name 必须是字符串' })
  @Length(1, 200, { message: '行程名称长度必须在 1-200 字符之间' })
  name?: string;
}
```

**UpdateTripDto**：
- 继承自 `PartialType(CreateTripDto)`，自动包含 `name` 字段

### 默认名称生成规则

**规则**：
```typescript
function generateDefaultTripName(trip: {
  destination: string;
  startDate: DateTime;
}): string {
  const dateStr = trip.startDate.toFormat('yyyy-MM-dd');
  const destinationName = getDestinationName(trip.destination); // 如 "冰岛"
  return `${destinationName} ${dateStr}`;
}
```

**示例**：
- `destination: "IS"`, `startDate: "2025-06-01"` → `"冰岛 2025-06-01"`
- `destination: "JP"`, `startDate: "2025-07-15"` → `"日本 2025-07-15"`

---

## 0.9 服务端与接口（API、权限、缓存、降级、容灾）

### API 接口变更

**创建行程接口**：
```
POST /api/trips
Request Body:
{
  "destination": "IS",
  "startDate": "2025-06-01",
  "endDate": "2025-06-10",
  "name": "冰岛环岛游"  // 新增：可选字段
}

Response:
{
  "success": true,
  "data": {
    "id": "...",
    "name": "冰岛环岛游",  // 新增字段
    "destination": "IS",
    ...
  }
}
```

**更新行程接口**：
```
PUT /api/trips/:id
Request Body:
{
  "name": "冰岛环岛游（修改版）"  // 新增：可选字段
}

Response:
{
  "success": true,
  "data": {
    "id": "...",
    "name": "冰岛环岛游（修改版）",  // 更新后的名称
    ...
  }
}
```

**获取行程接口**：
```
GET /api/trips/:id
Response:
{
  "success": true,
  "data": {
    "id": "...",
    "name": "冰岛环岛游",  // 新增字段
    "destination": "IS",
    ...
  }
}
```

**获取用户行程列表接口**：
```
GET /api/trips/user/:userId
Response:
{
  "success": true,
  "data": [
    {
      "id": "...",
      "name": "冰岛环岛游",  // 新增字段
      "destination": "IS",
      ...
    },
    ...
  ]
}
```

### 权限与安全

**权限要求**：
- 创建行程：需要用户认证（`@CurrentUser()`）
- 更新行程：需要用户认证 + 行程所有者权限
- 获取行程：公开接口（但需要行程 ID）

**安全考虑**：
- 名称字段不包含敏感信息（用户自行负责）
- 暂不实现内容审核（后续可扩展）
- SQL 注入防护：使用 Prisma ORM（参数化查询）

### 性能优化

**查询优化**：
- `name` 字段不需要单独索引（查询通常通过 `id`）
- 如果后续需要按名称搜索，可添加 `@@index([name])`

**缓存策略**：
- 行程详情缓存：包含 `name` 字段
- 列表缓存：包含 `name` 字段

### 降级与容灾

**降级策略**：
- 如果 `name` 字段查询失败，返回 `null` 或默认名称
- 不影响行程核心功能（创建、更新、删除）

**容灾方案**：
- 数据库迁移失败：回滚迁移，记录错误日志
- 已有数据兼容：查询时如果 `name` 为 `null`，自动生成默认名称

---

## 0.10 数据迁移方案

### 迁移脚本

**目标**：为所有已有行程生成默认名称

**迁移步骤**：
1. 查询所有 `name IS NULL` 的行程
2. 为每个行程生成默认名称：`${destination} ${startDate}`
3. 批量更新数据库

**SQL 迁移脚本**：
```sql
-- 为已有行程生成默认名称
UPDATE "Trip"
SET "name" = CONCAT(
  CASE 
    WHEN "destination" = 'IS' THEN '冰岛'
    WHEN "destination" = 'JP' THEN '日本'
    WHEN "destination" = 'US' THEN '美国'
    -- ... 其他目的地映射
    ELSE "destination"
  END,
  ' ',
  TO_CHAR("startDate", 'YYYY-MM-DD')
)
WHERE "name" IS NULL;
```

**Prisma 迁移文件**：
```prisma
// prisma/migrations/add_trip_name_field/migration.sql
ALTER TABLE "Trip" ADD COLUMN "name" VARCHAR(200);

-- 为已有数据生成默认名称
UPDATE "Trip"
SET "name" = CONCAT("destination", ' ', TO_CHAR("startDate", 'YYYY-MM-DD'))
WHERE "name" IS NULL;
```

### 迁移执行计划

1. **开发环境**：执行迁移，验证数据正确性
2. **测试环境**：执行迁移，进行完整测试
3. **生产环境**：
   - 备份数据库
   - 执行迁移（低峰期）
   - 验证数据完整性
   - 如有问题，回滚迁移

---

## 0.11 前端展示方案（信息架构、组件、状态、文案）

### 页面变更

**行程列表页**：
- **变更**：显示行程名称（而非仅显示目的地）
- **布局**：`[名称] - [目的地] - [日期范围]`
- **示例**：`冰岛环岛游 - IS - 2025-06-01 ~ 2025-06-10`

**行程详情页**：
- **变更**：页面标题显示行程名称
- **布局**：`[名称]`（大标题）+ `[目的地] - [日期范围]`（副标题）
- **编辑**：支持内联编辑名称

**创建行程页**：
- **变更**：新增"行程名称"输入框
- **位置**：在"目的地"字段下方
- **提示**：`"为你的行程起个名字吧（可选）"`
- **占位符**：`"例如：冰岛环岛游"`

### 组件设计

**TripNameInput 组件**：
```typescript
interface TripNameInputProps {
  value?: string;
  onChange: (name: string) => void;
  placeholder?: string;
  maxLength?: number;
}

// 显示：输入框 + 字符计数（0/200）
```

**TripNameDisplay 组件**：
```typescript
interface TripNameDisplayProps {
  name?: string;
  destination: string;
  startDate: string;
  fallback?: boolean; // 是否显示默认名称
}

// 显示：名称或默认名称
```

### 状态管理

**前端状态**：
- 创建行程：`tripName: string | undefined`
- 编辑行程：`tripName: string`
- 列表展示：`trips: Array<{ name?: string, ... }>`

### 文案规范

**提示文案**：
- 创建页：`"为你的行程起个名字吧（可选）"`
- 编辑页：`"修改行程名称"`
- 列表页：`"未命名行程"`（如果名称为空）

**错误文案**：
- 名称过长：`"行程名称不能超过 200 字符"`
- 名称为空：`"请输入行程名称"`（如果设为必填）

---

## 0.12 埋点与数据分析（事件、漏斗、A/B、质量监控）

### 埋点事件

**创建行程埋点**：
```typescript
// 事件：trip_created
{
  event: 'trip_created',
  properties: {
    trip_id: string,
    has_custom_name: boolean,  // 新增：是否使用自定义名称
    name_length: number,        // 新增：名称长度
    destination: string,
    // ... 其他属性
  }
}
```

**更新行程埋点**：
```typescript
// 事件：trip_updated
{
  event: 'trip_updated',
  properties: {
    trip_id: string,
    updated_fields: string[],    // 包含 'name' 如果更新了名称
    name_length: number,         // 新增：名称长度
    // ... 其他属性
  }
}
```

**查看行程埋点**：
```typescript
// 事件：trip_viewed
{
  event: 'trip_viewed',
  properties: {
    trip_id: string,
    has_name: boolean,           // 新增：是否有名称
    name_length: number,         // 新增：名称长度
    // ... 其他属性
  }
}
```

### 数据分析指标

**核心指标**：
- 名称填写率：`有自定义名称的行程数 / 总行程数`
- 名称平均长度：`所有名称长度之和 / 有名称的行程数`
- 名称更新率：`更新过名称的行程数 / 总行程数`

**漏斗分析**：
1. 创建行程 → 填写名称 → 保存行程
2. 查看行程 → 编辑名称 → 保存更新

**A/B 测试**（可选）：
- A 组：名称字段可选
- B 组：名称字段必填
- 指标：完成率、用户满意度

---

## 0.13 测试方案与验收标准

### 单元测试

**Service 层测试**：
```typescript
describe('TripsService.create', () => {
  it('应该保存用户提供的名称', async () => {
    const dto = { ..., name: '冰岛环岛游' };
    const trip = await service.create(dto, userId);
    expect(trip.name).toBe('冰岛环岛游');
  });

  it('应该为未提供名称的行程生成默认名称', async () => {
    const dto = { ..., name: undefined };
    const trip = await service.create(dto, userId);
    expect(trip.name).toMatch(/^冰岛 \d{4}-\d{2}-\d{2}$/);
  });
});
```

**DTO 验证测试**：
```typescript
describe('CreateTripDto', () => {
  it('应该拒绝超过 200 字符的名称', () => {
    const dto = { ..., name: 'a'.repeat(201) };
    expect(() => validate(dto)).toThrow();
  });
});
```

### 集成测试

**API 测试**：
```typescript
describe('POST /trips', () => {
  it('应该创建带名称的行程', async () => {
    const response = await request(app)
      .post('/trips')
      .send({ ..., name: '冰岛环岛游' });
    expect(response.body.data.name).toBe('冰岛环岛游');
  });
});
```

### 验收标准

**功能验收**：
- ✅ 创建行程时可以填写名称
- ✅ 创建行程时可以不填写名称（自动生成默认名称）
- ✅ 更新行程时可以修改名称
- ✅ 获取行程时返回名称字段
- ✅ 名称长度限制：1-200 字符
- ✅ 已有行程自动生成默认名称（数据迁移）

**性能验收**：
- ✅ API 响应时间增加 < 50ms
- ✅ 数据迁移时间 < 5 分钟（10万条数据）

**兼容性验收**：
- ✅ 现有 API 调用不受影响（向后兼容）
- ✅ 前端可以正常显示名称字段

---

## 0.14 风险清单与对策

### 技术风险

**风险 1：数据迁移失败**
- **影响**：已有行程无法显示名称
- **概率**：低
- **对策**：
  - 迁移前备份数据库
  - 迁移脚本支持回滚
  - 分批次迁移（如有大量数据）

**风险 2：性能影响**
- **影响**：API 响应时间增加
- **概率**：低
- **对策**：
  - 字段查询开销小（单字段）
  - 监控 API 响应时间
  - 如有问题，优化查询

**风险 3：名称冲突**
- **影响**：用户可能有多个同名行程
- **概率**：中
- **对策**：
  - 不强制唯一性（允许同名）
  - 后续可扩展唯一性校验

### 产品风险

**风险 1：用户不填写名称**
- **影响**：名称字段使用率低
- **概率**：中
- **对策**：
  - 提供默认名称（降低填写门槛）
  - 后续可考虑智能命名建议

**风险 2：名称内容不当**
- **影响**：包含不当内容
- **概率**：低
- **对策**：
  - 暂不实现内容审核（用户自行负责）
  - 后续可扩展内容审核功能

### 运营风险

**风险 1：数据迁移影响用户体验**
- **影响**：迁移期间服务不可用
- **概率**：低
- **对策**：
  - 低峰期执行迁移
  - 迁移脚本支持增量更新
  - 如有问题，快速回滚

---

## 0.15 里程碑与资源评估

### 开发里程碑

**Phase 1：数据库与后端（3 天）**
- Day 1：数据库迁移脚本 + Prisma Schema 更新
- Day 2：DTO 更新 + Service 层实现
- Day 3：API 测试 + 单元测试

**Phase 2：数据迁移（1 天）**
- Day 1：迁移脚本测试 + 生产环境执行

**Phase 3：前端实现（2 天）**
- Day 1：创建/编辑页面更新
- Day 2：列表/详情页面更新 + 测试

**Phase 4：测试与发布（2 天）**
- Day 1：集成测试 + 性能测试
- Day 2：灰度发布 + 监控

**总计**：8 个工作日

### 资源需求

**后端开发**：
- 1 名后端工程师（3 天）
- 1 名数据库工程师（1 天，迁移脚本）

**前端开发**：
- 1 名前端工程师（2 天）

**测试**：
- 1 名测试工程师（2 天）

**产品**：
- 1 名产品经理（1 天，PRD 与验收）

---

## 0.16 术语表与 FAQ

### 术语表

- **Trip**：行程，用户创建的旅行计划
- **Trip Name**：行程名称，用户可自定义的行程标题
- **Default Name**：默认名称，系统自动生成的行程名称
- **DTO**：Data Transfer Object，数据传输对象

### FAQ

**Q1：名称字段是必填的吗？**
A：不是。创建行程时可以不填写名称，系统会自动生成默认名称。

**Q2：可以修改已有行程的名称吗？**
A：可以。通过更新行程接口可以修改名称。

**Q3：名称可以重复吗？**
A：可以。同一用户可以有多个同名行程。

**Q4：名称支持 emoji 吗？**
A：支持。名称字段支持 UTF-8 字符，包括 emoji。

**Q5：已有行程会自动生成名称吗？**
A：会。通过数据迁移脚本，所有已有行程会自动生成默认名称。

**Q6：名称长度有限制吗？**
A：有。名称长度限制为 1-200 字符。

---

## 0.17 实施检查清单

### 开发阶段

- [ ] 数据库迁移脚本编写
- [ ] Prisma Schema 更新
- [ ] CreateTripDto 更新
- [ ] UpdateTripDto 更新
- [ ] TripsService.create() 实现
- [ ] TripsService.update() 实现
- [ ] 默认名称生成函数实现
- [ ] API 测试通过
- [ ] 单元测试通过

### 数据迁移阶段

- [ ] 迁移脚本测试
- [ ] 开发环境迁移验证
- [ ] 测试环境迁移验证
- [ ] 生产环境备份
- [ ] 生产环境迁移执行
- [ ] 数据完整性验证

### 前端开发阶段

- [ ] 创建行程页面更新
- [ ] 编辑行程页面更新
- [ ] 行程列表页面更新
- [ ] 行程详情页面更新
- [ ] 前端测试通过

### 发布阶段

- [ ] 集成测试通过
- [ ] 性能测试通过
- [ ] 灰度发布（10% 用户）
- [ ] 监控指标正常
- [ ] 全量发布
- [ ] 用户反馈收集

---

## 附录：技术实现细节

### 数据库迁移 SQL

```sql
-- 1. 添加 name 字段
ALTER TABLE "Trip" ADD COLUMN "name" VARCHAR(200);

-- 2. 为已有数据生成默认名称
UPDATE "Trip"
SET "name" = CONCAT(
  CASE 
    WHEN "destination" = 'IS' THEN '冰岛'
    WHEN "destination" = 'JP' THEN '日本'
    WHEN "destination" = 'US' THEN '美国'
    WHEN "destination" = 'CN' THEN '中国'
    ELSE UPPER("destination")
  END,
  ' ',
  TO_CHAR("startDate", 'YYYY-MM-DD')
)
WHERE "name" IS NULL;
```

### Service 层实现示例

```typescript
// src/trips/trips.service.ts

async create(dto: CreateTripDto, userId: string) {
  // 生成默认名称（如果未提供）
  const tripName = dto.name || this.generateDefaultTripName({
    destination: dto.destination,
    startDate: dto.startDate,
  });

  const trip = await this.prisma.trip.create({
    data: {
      id: randomUUID(),
      name: tripName,  // 新增字段
      destination: normalizedCountryCode,
      startDate: start.toJSDate(),
      endDate: end.toJSDate(),
      // ... 其他字段
    },
  });

  return trip;
}

private generateDefaultTripName(params: {
  destination: string;
  startDate: string;
}): string {
  const destinationName = this.getDestinationName(params.destination);
  const dateStr = params.startDate.split('T')[0]; // 提取日期部分
  return `${destinationName} ${dateStr}`;
}

private getDestinationName(countryCode: string): string {
  const map: Record<string, string> = {
    'IS': '冰岛',
    'JP': '日本',
    'US': '美国',
    'CN': '中国',
    // ... 其他映射
  };
  return map[countryCode] || countryCode;
}
```

---

**文档版本**：v1.0  
**最后更新**：2025-02-04  
**文档作者**：产品经理（Danny）  
**审核状态**：待审核
