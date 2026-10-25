# 执行风险知识库 · 管理端 API

> **读者**：后台管理端  
> **状态**：**P0+P1 已实现**（只读 + 版本 import/validate/activate + DRAFT CRUD + 审计 + smoke harness gate）；P2 未做  
> **实现**：`ExecutionRiskKnowledgeAdminController` → `/api/admin/execution-risk/knowledge`  
> **Base**：`{HOST}/api/admin/execution-risk/knowledge`  
> **响应**：统一 `{ success, data, error }`  
> **鉴权**：`AdminStrictAuthGuard` — `Authorization: Bearer <accessToken>`（ADMIN / OPERATOR），或 `x-admin-god-key`  
> **真源策略**：Package JSON 导入 → DB 版本化存储 → 激活单一版本供运行时读取；**仅 DRAFT 可单元格编辑**；激活默认跑 smoke harness

**对应知识资产（研究报告五张表）**：

| 研究表 | 知识资产 | DB |
|--------|----------|-----|
| 风险定义总表 | `risk-definitions` | `execution_risk_definitions` |
| 阈值矩阵 | `severity-rules` | `execution_risk_severity_rules` |
| 因果链 | `causal-chains` | `execution_risk_causal_chains` |
| 干预动作库 | `intervention-actions` | `execution_risk_intervention_actions` |
| Harness 场景 SC-* | `06_HARNESS` | **不进本 Admin**（CI / 工程验收） |

**实现参考**：

- Package：`docs/TripNARA-Execution-Risk-Backend-Package-V1/04_KNOWLEDGE/`
- 运行时仓储：`ExecutionRiskKnowledgeRepositoryService`（有激活版本读 DB，否则回退 package）
- 行程侧运行时 API：见同目录外 OpenAPI / `ExecutionRisksController`（**不是**本文范围）

---

## 0. 原则（必看）

1. **只读浏览 + 版本激活**为 P0；单元格 CRUD 为 P1（仅 `DRAFT` 版本可改）。
2. 任意时刻最多 **一个** `isActive=true` 的知识版本。
3. 激活前建议跑 harness（见 §6）；激活失败不得半切换。
4. 运行时 Trip 接口（`/api/trips/:tripId/execution-risks/*`）**不得**由本 Admin 直接写风险快照。
5. 与国家知识库类似：管理端路径挂 `/api/admin/...`，不占用 Trip 公开路径。

---

## 1. 知识版本 `KnowledgeVersion`

### 1.1 列表 / 详情

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/execution-risk/knowledge/versions` | 版本列表 |
| GET | `/api/admin/execution-risk/knowledge/versions/:versionId` | 版本详情 + 行数统计 |
| GET | `/api/admin/execution-risk/knowledge/versions/active` | 当前激活版本；无则 `data: null`（运行时走 package 回退） |

**列表 Query**：

| 参数 | 类型 | 说明 |
|------|------|------|
| status | string | `DRAFT` \| `VALIDATED` \| `ACTIVE` \| `DEPRECATED`（可选） |
| page | number | 默认 1 |
| limit | number | 默认 20，最大 100 |

**列表项示例**：

```json
{
  "id": "erv_20260709_a1",
  "packageVersion": "1.0.0",
  "status": "DRAFT",
  "isActive": false,
  "sourcePath": "docs/TripNARA-Execution-Risk-Backend-Package-V1/04_KNOWLEDGE",
  "rowCounts": {
    "definitions": 104,
    "severityRules": 38,
    "causalChains": 28,
    "actions": 34
  },
  "importedAt": "2026-07-09T10:00:00.000Z",
  "activatedAt": null
}
```

### 1.2 导入 / 激活 / 废弃

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/execution-risk/knowledge/versions/import` | 从 Package 路径导入为新版本（默认 `DRAFT`） |
| POST | `/api/admin/execution-risk/knowledge/versions/:versionId/validate` | 结构校验 +（可选）触发 harness 摘要 |
| POST | `/api/admin/execution-risk/knowledge/versions/:versionId/activate` | 激活；原 active 置 `DEPRECATED` / `isActive=false` |
| POST | `/api/admin/execution-risk/knowledge/versions/:versionId/deprecate` | 手动废弃（不可废弃唯一 active，除非 `force`） |

**POST import Body**：

```json
{
  "sourcePath": "docs/TripNARA-Execution-Risk-Backend-Package-V1/04_KNOWLEDGE",
  "mappingPath": "docs/TripNARA-Execution-Risk-Backend-Package-V1/05_MAPPING/risk-code-mapping-v1.csv",
  "packageVersion": "1.0.0",
  "status": "DRAFT",
  "note": "同步研究表 v1"
}
```

**POST activate Body**（可选）：

```json
{
  "requireValidated": true,
  "skipHarnessGate": false
}
```

- `requireValidated=true`（默认）：仅 `VALIDATED` 可激活  
- `skipHarnessGate=true`：跳过 smoke harness（写入审计日志）；默认 **false**，激活前跑 `SH-ENV-001..003`

**POST validate Body**（可选）：

```json
{
  "runHarness": true,
  "scenarioIds": ["SH-ENV-001", "SH-ENV-002"]
}
```

- 默认仅结构校验；`runHarness=true` 时额外跑 smoke harness，失败则不升为 `VALIDATED`

**激活成功回显**：

```json
{
  "previousActiveVersionId": "erv_old",
  "activeVersionId": "erv_20260709_a1",
  "activatedAt": "2026-08-11T07:00:00.000Z",
  "runtimeCacheRefreshed": true
}
```

---

## 2. 风险定义 `Definitions`（研究表 1 · 字段全量）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `.../field-catalog` | **全表字段目录 + 中文含义**（表头用这个） |
| GET | `.../versions/:versionId/definitions` | 分页列表（已按研究表列展开） |
| GET | `.../versions/:versionId/definitions/:knowledgeCode` | 单条详情 |

**列表 Query**：`riskType` / `isRootCause` / `q` / `page` / `limit`

### 2.1 字段字典（中文）

| 字段 | 中文名 | 含义 | 状态 |
|------|--------|------|------|
| riskCode | 风险编码 | 业务唯一码（= knowledgeCode） | 已返回 |
| knowledgeCode | 知识编码 | 知识库主键 | 已返回 |
| canonicalCode | 规范编码 | 对外稳定码，如 WEATHER_STRONG_WIND | 已返回 |
| riskType | 风险大类 | ENVIRONMENT / ROAD_TRANSPORT / MEMBER_STATE / … | 已返回 |
| subCategory | 子类目 | 风、降水、水文、地质等 | P2 占位 null |
| itemName | 风险项名称 | 中文短名（来自 displayName.zh） | 已返回 |
| displayName | 多语言显示名 | `{ zh, en }` | 已返回 |
| definition | 定义说明 | 判定口径与技术定义 | 已返回 |
| mainCauseType | 主因类型 | 气象 / 人因 / 交通事故等 | P2 占位 null |
| isRootCause | 是否根因 | 可否作为因果链根节点 | 已返回 |
| affectedActivities | 影响活动范围 | 户外、驾驶等 | P2 占位 null |
| affectedTransport | 影响交通方式 | 全车辆、航空/船等 | P2 占位 null |
| spatialScope | 空间尺度 | 区域 / 局部 / 流域 / 个人 | P2 占位 null |
| temporalScope | 时间尺度 | 分钟级 / 小时级 / 天级 | P2 占位 null |
| confidenceRule | 置信规则 | 触发置信口径 | P2 占位 null |
| regionalDiffReferences | 地区差异参考 | NZ / 冰岛分区等 | P2 占位 null |
| evidenceSource | 证据来源 | NWS / IMO / WHO… | P2 占位 null |
| evidenceGrade | 证据等级 | A–D | P2 占位 null |
| sourceAliases | 来源别名 | 旧码映射 | 已返回 |
| status | 条目状态 | DRAFT 等 | 已返回 |
| since | 生效起始 | 纳入日期 | 已返回 |
| generationMode | 生成模式 | 直接检测 / 因果推导… | 已返回 |
| capabilityStatus | 能力状态 | 是否启用 | 已返回 |

**详情示例（展开后）**：

```json
{
  "riskCode": "ENV-WIND-01",
  "knowledgeCode": "ENV-WIND-01",
  "canonicalCode": "WEATHER_STRONG_WIND",
  "riskType": "ENVIRONMENT",
  "subCategory": null,
  "itemName": "强风",
  "displayName": { "en": "Strong Wind", "zh": "强风" },
  "definition": "Sustained wind speed exceeding safety thresholds…",
  "mainCauseType": null,
  "isRootCause": true,
  "affectedActivities": null,
  "affectedTransport": null,
  "spatialScope": null,
  "temporalScope": null,
  "confidenceRule": null,
  "regionalDiffReferences": null,
  "evidenceSource": null,
  "evidenceGrade": null,
  "sourceAliases": ["STRONG_WIND", "HIGH_WIND"],
  "status": "DRAFT",
  "since": "2026-07-09",
  "generationMode": "DIRECT_DETECTION",
  "capabilityStatus": "ENABLED"
}
```

### 2.2 P1 草稿编辑（仅 `version.status=DRAFT`）

| 方法 | 路径 | 说明 |
|------|------|------|
| PUT / PATCH / POST / DELETE | `.../definitions[/:knowledgeCode]` | 非 DRAFT → 409 |

---

## 3. 阈值规则 `SeverityRules`（研究表 2 · 字段全量）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `.../severity-rules` | 列表（已展开研究表列） |
| GET | `.../severity-rules/:ruleId` | 详情 |

**列表 Query**：`knowledgeCode` / `level` / `metric` / `q` / `page` / `limit`

> 研究表一行「矩阵」在引擎里拆成多条 `level` 规则；列表每条规则会带上对应门禁列。

### 3.1 字段字典（中文）

| 字段 | 中文名 | 含义 | 状态 |
|------|--------|------|------|
| ruleId | 规则 ID | 单条阈值唯一标识 | 已返回 |
| riskCode | 风险编码 | = knowledgeCode | 已返回 |
| knowledgeCode | 知识编码 | 绑定风险 | 已返回 |
| riskName | 风险名称 | 由定义表补齐中文名 | 已返回 |
| observationIndicator | 观测指标 | metric + unit，如风速 (MPS) | 已返回 |
| metric | 指标 ID | 机器可读指标 | 已返回 |
| unit | 单位 | MPS / mm/h 等 | 已返回 |
| level | 门禁等级 | AT_RISK / REPLAN_REQUIRED / STOP / RECOVERY | 已返回 |
| operator | 比较算子 | GTE / LT / BETWEEN… | 已返回 |
| minValue / maxValue | 阈值 | 下限 / 上限 | 已返回 |
| conditionText | 条件文本 | 可读条件，如 `>= 20 MPS` | 已返回 |
| normalCondition | 正常条件 | 研究表列 | P2 占位 null |
| atRiskCondition | 有风险条件 | level=AT_RISK 时填 conditionText | 已返回 |
| replanCondition | 需改线条件 | level=REPLAN* 时填 | 已返回 |
| stopCondition | 停止条件 | level=STOP 时填 | 已返回 |
| recoveryCondition | 恢复条件 | level=RECOVERY 时填 | 已返回 |
| conditions | 附加条件 | 车型/成员等情境（对应修饰列） | 已返回 |
| activityModifier | 活动修饰 | 按活动调阈值 | P2 占位 null |
| vehicleModifier | 车辆修饰 | 按车型调阈值 | P2 占位 null |
| memberModifier | 成员修饰 | 儿童/老人等 | P2 占位 null |
| officialRuleModifier | 官方规则修饰 | 官方警告覆盖 | P2 占位 null |
| priority | 优先级 | 同风险多规则排序 | 已返回 |
| description | 规则说明 | 人可读说明 | 已返回 |
| evidenceIds | 证据 ID | 支撑材料 ID | 已返回 |
| evidenceSource | 证据来源 | 研究表权威名 | P2 占位 null |

---

## 4. 因果链 `CausalChains`（研究表 3 · 字段全量）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `.../causal-chains` | 列表 |
| GET | `.../causal-chains/:chainId` | 详情 |

### 4.1 字段字典（中文）

| 字段 | 中文名 | 含义 | 状态 |
|------|--------|------|------|
| chainId / chainID | 因果链 ID | 如 CC-E1 | 已返回 |
| rootCause | 风险根源 | 根因描述 | 已返回 |
| rootCauseCode | 根因编码 | ENV-WIND-01 | 已返回 |
| knowledgeCode | 主知识编码 | 锚定主风险 | 已返回 |
| name | 因果链名称 | 标题 | 已返回 |
| directImpact1/2 | 直接影响 | 前两个 DIRECT_IMPACT 描述 | 已返回 |
| directImpacts | 直接影响列表 | 全部直接后果节点 | 已返回 |
| derivedImpact1/2/3 | 衍生影响 | 前三个 DERIVED_IMPACT | 已返回 |
| derivedImpacts | 衍生影响列表 | 全部衍生节点 | 已返回 |
| decisionTrigger | 决策触发点 | DECISION_TRIGGER 描述 | 已返回 |
| sharedSolution | 公共解决方案 | 标准处置摘要 | P2 占位 null |
| clusterRule | 汇聚规则 | = clusterHint | 已返回 |
| recoveryCascade | 恢复与联动 | 恢复条件联动 | P2 占位 null |
| applicableDomains | 适用领域 | ENV/ROAD/… | P2 占位 null |
| nodes | 节点列表 | 完整因果图节点 | 已返回 |
| edges | 边列表 | CAUSES / TRIGGERS… | 已返回 |
| clusterHint | 聚类提示 | 主码 + 可抑制码 | 已返回 |

---

## 5. 干预动作 `InterventionActions`（研究表 4 · 字段全量）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `.../actions` | 列表 |
| GET | `.../actions/:actionCode` | 详情 |

### 5.1 字段字典（中文）

| 字段 | 中文名 | 含义 | 状态 |
|------|--------|------|------|
| actionCode | 动作编码 | ACT-TIME-EARLIER | 已返回 |
| actionName | 动作名称 | 中文名 | 已返回 |
| name | 多语言名称 | `{ zh, en }` | 已返回 |
| actionCategory | 动作类别 | 时间/路线/活动/预订/团队/交通/应急 | 已返回 |
| description | 动作描述 | 做什么 | 已返回 |
| typicalUseCase | 典型场景 | 何时用 | 已返回 |
| safetyImpact | 安全影响 | -2…+2 | 已返回 |
| timeImpactMin | 时间影响（分钟） | 可读区间字符串 | 已返回 |
| timeImpactMinRange | 时间影响区间 | `{ min, max }` | 已返回 |
| fatigueImpact | 疲劳影响 | 疲劳分变化 | 已返回 |
| experienceImpact | 体验影响 | 体验分变化 | 已返回 |
| budgetImpact | 预算影响 | = budgetImpactDescription | 已返回 |
| budgetImpactDescription | 预算影响说明 | 费用文字 | 已返回 |
| bookingImpact | 预订影响 | NONE/NOTIFY/RESCHEDULE… | 已返回 |
| reversibility | 可逆性 | YES / PARTIAL / NO | 已返回 |
| userConfirmRequired | 需用户确认 | 是否人工确认 | 已返回 |
| isAutoExecutable | 可自动执行 | = aiAutoExecutable | 已返回 |
| aiAutoExecutable | AI 可自动执行 | 系统自动触发开关 | 已返回 |
| applicableRiskCodes | 适用风险编码 | 可挂哪些风险 | 已返回 |
| capabilities | 所需能力 | UPDATE_PLAN 等 | 已返回 |
| executionMode | 执行模式 | CONFIRM_BEFORE_WRITE 等 | 已返回 |

P1 草稿编辑同模式。  
**安全约束**：`aiAutoExecutable=true` 且 `userConfirmRequired=false` 时，validate 会记入 warnings。

---

## 5b. 字段目录 API（后台表头必用）

### `GET /api/admin/execution-risk/knowledge/field-catalog`

返回四张研究表 + 版本表的完整字段元数据：

```json
{
  "tables": [
    {
      "tableId": "definitions",
      "tableNameZh": "风险定义总表",
      "fields": [
        {
          "field": "riskCode",
          "labelZh": "风险编码",
          "meaningZh": "风险条目唯一业务编码…",
          "type": "string",
          "example": "ENV-WIND-01",
          "status": "derived"
        }
      ]
    }
  ],
  "legend": {
    "shipped": "API 已落库并返回",
    "derived": "由已有字段推导，列表/详情已展开",
    "planned": "研究表有列、P2 才落库；当前返回 null，前端可先占位列"
  }
}
```

**前端建议**：表头用 `labelZh`，列 tooltip 用 `meaningZh`；`status=planned` 的列可灰显。

---

## 6. 管理端推荐流程

```
1. GET .../field-catalog            // 拉中文表头与含义
2. GET .../versions/active
3. POST .../versions/import
4. GET .../versions/:id/definitions|severity-rules|causal-chains|actions
5. （P1）DRAFT 上 PATCH
6. POST .../validate { "runHarness": true }
7. POST .../activate
```

**不要**：

- 把 Harness `SC-01…SC-20` 做成运营可编辑配置页  
- 在 Admin 里直接改 Trip 的 ActiveRisk 快照  
- 无版本地「保存即生产」

---

## 7. 错误码

| code | HTTP 语义 | 场景 |
|------|-----------|------|
| VALIDATION_ERROR | 400 | import 缺文件 / 规则字段不完整 |
| UNAUTHORIZED | 401 | 未登录 |
| FORBIDDEN | 403 | 非 ADMIN/OPERATOR；或非 ADMIN 使用 skipHarnessGate |
| NOT_FOUND | 404 | version / knowledgeCode / ruleId / actionCode / chainId 不存在 |
| CONFLICT | 409 | 激活冲突、VERSION_NOT_EDITABLE、重复 knowledgeCode |
| HARNESS_GATE_FAILED | 422 | validate/activate 未过 harness |
| INTERNAL_ERROR | 500 | 未预期错误 |

---

## 8. 与运行时 / Package 的关系

| 层 | 职责 |
|----|------|
| Package `04_KNOWLEDGE/*.json` | 研究与工程种子真源（git） |
| Admin Knowledge API（本文） | 版本导入、表格字段展开、DRAFT 编辑、激活 |
| `field-catalog` | 表头中文名 + 含义（与研究表对齐） |
| `execution_risk_knowledge_*` 表 | 版本化落库 |
| `ExecutionRiskKnowledgeRepositoryService` | 运行时读 active 或 package 回退 |
| `/api/trips/:tripId/execution-risks/*` | 行程风险读模型与方案 apply/confirm |
| `06_HARNESS` | 工程验收；**不**暴露为业务 Admin CRUD |

OpenAPI（行程侧，已有）：  
`docs/TripNARA-Execution-Risk-Backend-Package-V1/02_API/execution-risk-openapi-v1.yaml`

---

## 9. 实现分期建议

| 阶段 | 范围 | 状态 |
|------|------|------|
| **P0** | 版本 + 只读 GET | ✅ |
| **P1** | DRAFT CRUD + 审计 + smoke harness | ✅ |
| **P1.1** | 研究表字段展开 + field-catalog 中文 | ✅ |
| **P1.2** | 风险 ↔ 约束映射表 + Admin CRUD + resolve | ✅ |
| **P1.3** | 运行时接线：Enrichment / Feasibility / Constraints / Advisory / Apply | ✅ |
| **P2** | subCategory / 修饰列 / evidence / sharedSolution 等落库 | 未做 |

代码入口：

- 字段目录：`knowledge/execution-risk-knowledge-field-catalog.ts`
- 风险↔约束：`knowledge/execution-risk-constraint-binding.defaults.ts` + `services/execution-risk-constraint-binding.service.ts`
- Controller / Service / Draft / Harness gate / Import util（同前）

**P1.1 说明**：列表/详情已按研究表列名展开；`planned` 字段先返回 `null`，前端可按 `field-catalog` 占满表格列。

---

## 10. 风险 ↔ 约束映射（桥接）

> 用绑定表声明：`knowledgeCode + severityLevel` → 约束模板 / 类别 / 门禁 / 违反类。

### 10.1 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/execution-risk/knowledge/constraint-bindings` | 列表（含 `fieldLabelsZh`） |
| GET | `.../constraint-bindings/templates` | **约束模板目录（下拉真源）** |
| GET | `.../constraint-bindings/templates/:templateId` | 模板详情（含 usageCount） |
| GET | `.../constraint-bindings/resolve?knowledgeCode=&severityLevel=` | 按风险+门禁解析应挂约束 |
| POST | `.../constraint-bindings/seed-defaults` | 导入默认种子（幂等） |
| POST | `.../constraint-bindings` | 新建 |
| GET/PUT/PATCH/DELETE | `.../constraint-bindings/:id` | 详情 / 更新 / 删除 |

### 10.1.1 约束模板目录（真源约定）

- **真源**：`CODE_REGISTRY` — `knowledge/execution-risk-constraint-templates.ts`
- **id** 与运行时 TripConstraint `LEGACY_IDS` / `OFFICIAL_IS` 及 Enrichment/Feasibility/Constraints/Advisory/Apply 消费的模板 ID **完全一致**
- **seed-defaults** 的全部 `constraintTemplateId` ⊆ templates 目录（单测强制）
- Query：`q`、`status`（默认 `ENABLED`；`all` 含 DISABLED/DEPRECATED）、`constraintCategory`、`page`/`limit`
- 列表项含 `usageCount`；选中后可预填 category/type/gate/blocked/notesZh

职责拆分：`templates` = 有哪些模板可选用；`seed-defaults` = 导入默认风险+门禁→模板绑定行；CRUD = 维护映射。

### 10.2 字段（中文）

| 字段 | 中文名 | 含义 |
|------|--------|------|
| knowledgeCode / riskCode | 风险知识编码 | 如 ENV-WIND-01 |
| severityLevel | 触发门禁级别 | STOP / REPLAN_REQUIRED / AT_RISK；空=任意 |
| constraintCategory | 约束类别 | SAFETY / TIME / TRANSPORT / MEMBER / WORLD_STATE… |
| constraintType | 软硬类型 | HARD / SOFT / EXTERNAL |
| constraintTemplateId | 约束模板 ID | 如 `c_official_is_wind_safety`、`c_no_night_drive` |
| feasibilityDimension | 可行性维度 | environment / schedule / transport / booking / team_fit |
| executionGate | 执行门禁 | 建议对齐的门禁 |
| violationClass | 违反类别 | HARD_SAFETY / HARD_TIME / HARD_BOOKING / HARD_MEMBER / SOFT |
| blocked | 是否硬阻断 | true=方案不可行 |
| notesZh | 中文备注 | 运营说明 |
| priority | 优先级 | 越小越优先 |

列表项另带 `constraintCategoryZh` / `constraintTypeZh` / `executionGateZh` / `blockedZh`。

### 10.3 默认种子（节选）

| 风险 | 门禁 | 约束模板 | 说明 |
|------|------|----------|------|
| ENV-WIND-01 | STOP | c_official_is_wind_safety | 官方风力安全，硬阻断 |
| ENV-WIND-01 | REPLAN_REQUIRED | c_world_feasibility | 世界态可行性 |
| ROAD-CLOSE-01 | STOP | c_world_feasibility | 道路封闭 |
| MEMBER-FATIGUE-DRIVER-01 | REPLAN_REQUIRED | c_max_daily_drive | 日驾上限 |
| ENV-LIGHT-01 | REPLAN_REQUIRED | c_no_night_drive | 禁止夜驾 |
| ENV-VOLC-01 | STOP | c_official_is_red_alert | 红色警报 |

### 10.4 推荐流程

```
1. POST .../constraint-bindings/seed-defaults
2. GET  .../constraint-bindings
3. GET  .../constraint-bindings/resolve?knowledgeCode=ENV-WIND-01&severityLevel=STOP
4. 运行时自动消费（P1.3）：
   - ActiveRisk.enrichment → `constraintBinding`
   - Feasibility report → `risk_constraint_binding` issues
   - Constraints list → 绑定模板标 CONFLICTED
   - Advisory verdict 对齐绑定门禁
   - Apply preview.validation → constraintTemplateIds / anyBlocked
```
