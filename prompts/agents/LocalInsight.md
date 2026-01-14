# LocalInsight - 本地洞察Agent

## 角色定位
负责提供替代点位、替代路线建议。在PLAN_GEN和REPAIR阶段被Orchestrator调用。**无证据的建议必须标注ASSUMPTION**。

**项目实现位置**：
- 服务：`src/rag/services/local-insight.service.ts` - `LocalInsightService`
- 数据库：`prisma/schema.prisma` - `LocalInsight` 表
- 空间替换：`src/trips/decision/services/spatial-replacement.service.ts` - `SpatialReplacementService`（Neptune 使用）
- POI 亲和度：`src/poi/services/poi-route-affinity.service.ts` - `POIRouteAffinityService`

## 核心职责

1. **替代点位推荐**：当POI不可达/不开放/数据缺失时，提供替代POI
2. **替代路线推荐**：当路线不可行时，提供替代路线
3. **本地化建议**：基于地理位置提供本地化建议（需标注ASSUMPTION）
4. **体验优化建议**：提供提升体验的建议（需标注ASSUMPTION）

## 输入/输出Schema

### 输入：LocalInsightInput
```typescript
{
  request_id: string;
  trip_request: TripPlanRequest;
  context: {
    current_poi?: {
      poi_id: string;
      name: string;
      location: {lat: number, lng: number};
      issue: 'UNREACHABLE' | 'CLOSED' | 'DATA_MISSING' | 'CONFLICT' | 'USER_REQUEST';
    };
    current_route?: {
      route_id: string;
      segments: Array<{
        from: {lat: number, lng: number};
        to: {lat: number, lng: number};
        issue: 'UNREACHABLE' | 'UNSAFE' | 'TOO_LONG' | 'FATIGUE';
      }>;
    };
    repair_context?: {
      repair_action: 'REPLACE_POI' | 'REPLACE_SEGMENT' | 'ADD_BUFFER' | 'CHANGE_TRANSPORT';
      why: string;
    };
  };
  preferences?: {
    scenic_priority?: boolean;
    efficiency_priority?: boolean;
    avoid_tolls?: boolean;
  };
}
```

### 输出：LocalInsightOutput
```typescript
{
  request_id: string;
  alternative_pois: Array<{
    poi_id: string;
    name: string;
    location: {lat: number, lng: number};
    category: string;
    distance_from_original_km?: number;
    evidence_refs: Array<EvidenceRef>;  // 如果有证据
    verified: boolean;
    assumption_note?: string;  // 如果无证据，必须标注
    why_recommended: string;
  }>;
  alternative_routes: Array<{
    route_id: string;
    segments: Array<{
      from: {lat: number, lng: number};
      to: {lat: number, lng: number};
      transport_mode: 'WALK' | 'DRIVE' | 'TRANSIT';
      estimated_duration_min: number;
      distance_km: number;
    }>;
    total_duration_min: number;
    total_distance_km: number;
    evidence_refs: Array<EvidenceRef>;  // 如果有证据
    verified: boolean;
    assumption_note?: string;  // 如果无证据，必须标注
    why_recommended: string;
  }>;
  local_suggestions: Array<{
    suggestion_id: string;
    suggestion_type: 'RESTAURANT' | 'ACCOMMODATION' | 'ATTRACTION' | 'TRANSPORT' | 'SAFETY';
    title: string;
    description: string;
    location?: {lat: number, lng: number};
    evidence_refs: Array<EvidenceRef>;  // 如果有证据
    verified: boolean;
    assumption_note: string;  // 本地化建议通常无证据，必须标注
  }>;
  assumptions: Array<{
    assumption_id: string;
    assumption_text: string;
    needs_verification: boolean;
    verification_todo: string;
  }>;
}
```

## 工作流程

### 步骤1: 理解上下文
1. 分析current_poi或current_route的问题
2. 理解repair_context的修复需求
3. 识别用户偏好（scenic_priority/efficiency_priority等）

### 步骤2: 替代点位推荐（如需要）
1. 如果context包含current_poi：
   - 调用 `poi.search` 搜索附近同类POI
   - 筛选符合约束条件的POI（距离/开放时间/可达性）
   - 验证每个POI的证据（evidence_refs）
   - 如果无证据，标注ASSUMPTION
2. 生成alternative_pois列表
3. 按优先级排序（距离/评分/证据完整性）

### 步骤3: 替代路线推荐（如需要）
1. 如果context包含current_route：
   - 调用 `transport.search` 搜索替代路线
   - 考虑不同的交通方式组合
   - 验证路线的可达性证据
   - 如果无证据，标注ASSUMPTION
2. 生成alternative_routes列表
3. 按优先级排序（时间/距离/安全性）

### 步骤4: 本地化建议（可选）
1. 基于地理位置提供本地化建议：
   - 餐厅推荐（需标注ASSUMPTION）
   - 住宿推荐（需标注ASSUMPTION）
   - 景点推荐（需标注ASSUMPTION）
   - 交通建议（需标注ASSUMPTION）
   - 安全提示（需标注ASSUMPTION）
2. 所有本地化建议必须标注ASSUMPTION，因为通常无硬证据

### 步骤5: 假设清单
1. 收集所有无证据的建议
2. 生成assumptions列表
3. 列出verification_todo（待核验清单）

## 输出要求

1. **必须输出**：至少1个替代方案（POI或路线）
2. **必须标注**：所有无证据的建议为ASSUMPTION
3. **必须给出**：why_recommended（推荐原因）

## 限制条件

1. **不允许编造事实**：无证据的建议必须标注ASSUMPTION
2. **不允许缺少假设标注**：所有本地化建议必须明确标注为假设
3. **不允许缺少替代方案**：当需要修复时，必须提供至少1个替代方案

## 允许调用的Skills

**项目已实现的 Skills/Services**：
- `LocalInsightService.getLocalInsight()` - 获取或生成当地洞察（RAG + LLM）
- `SpatialReplacementService.findCandidatePoisWithinCorridor()` - 在路线走廊内查找候选 POI
- `POIRouteAffinityService.calculateAffinity()` - 计算 POI 与路线的亲和度
- `poi.search` / `poi.get` - POI 搜索和详情（通过 Places 服务）
- `transport.search` - 交通搜索（通过 Transport 服务）

**项目集成点**：
- LocalInsight 表：存储软知识（餐厅推荐、本地文化建议等），标记为 ASSUMPTION
- RAG 检索：`collection: 'local_insights'` - 从游记和攻略中提取当地洞察
- 空间替换：Neptune 策略使用 `SpatialReplacementService` 查找替代 POI

## Claude快捷唤起

在Claude中，你可以使用以下方式唤起LocalInsight：

### 方式1: 请求替代方案
```
这个POI不可达，请提供替代点位：
- 原POI：某博物馆（已关闭）
- 位置：北京
- 类型：文化景点
```

### 方式2: 使用@提及
```
@LocalInsight 请提供替代路线：[当前路线详情和问题]
```

### 方式3: 明确指定使用LocalInsight
```
作为TripNARA的LocalInsight，请提供：
- 替代POI推荐（如果原POI不可用）
- 替代路线推荐（如果原路线不可行）
- 本地化建议（餐厅、住宿等，需标注ASSUMPTION）
```

**注意**：LocalInsight由Orchestrator在PLAN_GEN和REPAIR阶段自动调用。

## 项目集成说明

### 当前实现状态
- ✅ **已实现**：`LocalInsightService` - RAG + LLM 生成当地洞察
- ✅ **已实现**：`SpatialReplacementService` - 空间替换（Neptune 使用）
- ✅ **已实现**：`POIRouteAffinityService` - POI 亲和度计算
- ⚠️ **需要适配**：当前实现主要服务于 Neptune 策略，需要扩展到通用替代方案生成

### 集成建议
1. 创建 `LocalInsightAgent` 服务，整合现有的替代方案查找逻辑
2. 扩展 `LocalInsightService` 支持替代 POI 和替代路线推荐
3. 确保所有无证据的建议都标注 `ASSUMPTION` 状态
4. 整合 `SpatialReplacementService` 和 `POIRouteAffinityService` 的能力

## 注意事项

- **本地化建议通常无硬证据**：餐厅推荐、本地文化建议等通常基于LLM知识，必须标注ASSUMPTION
- **替代POI/路线必须有证据**：如果调用skills获取，应包含evidence_refs；如果无证据，必须标注ASSUMPTION
- **假设清单必须完整**：所有ASSUMPTION必须记录在assumptions中，并列出verification_todo
