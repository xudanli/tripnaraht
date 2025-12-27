# Spatial Issue Detection（空间问题检测）

## 概述

Neptune 从"遇到 issue 再修复"升级到"真正能发现 issue"，实现了完整的空间问题自动检测系统。

## 检测的问题类型

### 1. ENTRY_UNREACHABLE（入口不可达）

**检测逻辑：**
- 检查入口道路状态（CLOSED / SEASONAL）
- 检查季节性道路的开放时间窗口
- 支持跨年季节性判断

**数据来源：**
- `RoadRepository.findBySegmentId()` - 根据路段 ID 查找道路

**示例场景：**
- 冰岛 F 路入口在冬季封闭
- 瑞士高阿尔卑斯山口在 11 月-5 月关闭

### 2. POI_UNAVAILABLE（景点/节点不可用）

**检测逻辑：**
- 检查 POI 状态（CLOSED）
- 检查 POI 有效期（validTo < now）
- 记录关闭原因

**数据来源：**
- `PoiRepository.findManyByIds()` - 批量查找 POI 状态

**示例场景：**
- 观景点因施工关闭
- 博物馆临时闭馆
- POI 数据过期

### 3. SEGMENT_BLOCKED（路段被封）

**检测逻辑：**
- 检查非入口路段的状态（CLOSED / RESTRICTED）
- 检查路段危险标签（hazardTag）
- 跳过第一天（入口已在 ENTRY_UNREACHABLE 中处理）

**数据来源：**
- `RoadRepository.findBySegmentId()` - 根据路段 ID 查找道路

**示例场景：**
- 道路因雪崩封闭
- 路段受限通行

### 4. FERRY_CANCELLED（渡轮中断）

**检测逻辑：**
- 检查渡轮状态（CANCELLED / SEASONAL）
- 检查季节性渡轮的开放时间窗口
- 支持跨年季节性判断

**数据来源：**
- `FerryRepository.findById()` - 根据渡轮 ID 查找

**示例场景：**
- 渡轮因天气停运
- 季节性渡轮在冬季不运营

### 5. HAZARD_ZONE（危险区域）

**检测逻辑：**
- 检查路段是否穿越危险区域
- 区分风险等级（HIGH / MEDIUM / LOW）
- 记录危险类型（AVALANCHE / MUDSLIDE / FLOOD / GLACIER_CREVASSE / ROCKFALL）

**数据来源：**
- `HazardService.checkSegment()` - 检查路段危险区域

**示例场景：**
- 雪崩带
- 泥石流区域
- 冰川裂隙区

## 数据源抽象

### RoadRepository

```typescript
interface RoadRepository {
  findBySegmentId(segmentId: string): Promise<Road | null>;
  findByPoiId(poiId: string): Promise<Road | null>;
}
```

**Road 接口：**
- `status`: OPEN | CLOSED | SEASONAL | RESTRICTED
- `seasonOpenFrom` / `seasonOpenTo`: 1-12
- `hazardTag`: AVALANCHE | FLOOD | MUDSLIDE | NONE

### PoiRepository

```typescript
interface PoiRepository {
  findManyByIds(poiIds: string[]): Promise<PoiStatusData[]>;
  findById(poiId: string): Promise<PoiStatusData | null>;
}
```

**PoiStatusData 接口：**
- `status`: OPEN | CLOSED | UNKNOWN
- `closingReason`: 关闭原因
- `validFrom` / `validTo`: 有效期

### FerryRepository

```typescript
interface FerryRepository {
  findById(ferryId: string): Promise<Ferry | null>;
}
```

**Ferry 接口：**
- `status`: RUNNING | CANCELLED | SEASONAL
- `seasonOpenFrom` / `seasonOpenTo`: 1-12

### HazardService

```typescript
interface HazardService {
  checkSegment(segmentId: string): Promise<HazardZone | null>;
}
```

**HazardZone 接口：**
- `level`: LOW | MEDIUM | HIGH
- `hazardType`: AVALANCHE | MUDSLIDE | FLOOD | GLACIER_CREVASSE | ROCKFALL | OTHER

## SpatialIssueDetectorService

### 核心方法

```typescript
async detect(
  world: WorldModelContext,
  plan: RoutePlanDraft
): Promise<SpatialIssue[]>
```

**检测流程：**
1. 调用 `detectEntryIssues()` - 检测入口问题
2. 调用 `detectPoiIssues()` - 检测 POI 问题
3. 调用 `detectSegmentIssues()` - 检测路段问题
4. 调用 `detectFerryIssues()` - 检测渡轮问题
5. 调用 `detectHazardIssues()` - 检测危险区域
6. 合并所有问题并返回

### 季节性判断逻辑

```typescript
const isOpen =
  openFrom <= openTo
    ? m >= openFrom && m <= openTo
    : m >= openFrom || m <= openTo; // 跨年
```

支持跨年季节性判断（例如：11 月-3 月开放）。

## 集成到 Neptune Strategy

Neptune Strategy 现在使用 `SpatialIssueDetectorService` 自动检测问题：

```typescript
const detectedIssues = await this.spatialIssueDetector.detect(world, plan);
const additionalIssues = await this.detectAdditionalSpatialIssues(world, plan);
const spatialIssues = [...detectedIssues, ...additionalIssues];
```

**补充检测：**
- 天气硬违规导致的路段阻塞
- 合规问题（需要许可但未获得）

## 测试场景

### 1. ENTRY_UNREACHABLE 替换成功
- Given: 入口道路封闭，corridor 内存在替代入口
- Expect: 检测出问题，Neptune 成功替换

### 2. ENTRY_UNREACHABLE 但无替代
- Given: 入口封闭，corridor 内无其他入口
- Expect: Neptune 返回 NO_SUITABLE_REPLACEMENT

### 3. POI_UNAVAILABLE 替换成功
- Given: POI 关闭，corridor 内有替代 POI
- Expect: 检测出问题，Neptune 成功替换，节奏不变

### 4. SEGMENT_BLOCKED 局部绕行
- Given: 路段阻塞，存在绕行路径
- Expect: Neptune 将一个 segment 替换为多个，天数不变

### 5. HAZARD_ZONE 高风险 → 不修而告知
- Given: 高风险区域，无可绕行路网
- Expect: Neptune 不做 REPLACE，返回告知日志

### 6. 多 Issue 叠加
- Given: 入口封闭 + POI 关闭
- Expect: Neptune 依次处理，最终 plan 连贯

## 文件结构

```
src/trips/decision/
├── interfaces/
│   ├── spatial-issue.interface.ts      # 空间问题接口
│   ├── road.interface.ts                # 道路接口
│   ├── poi-status.interface.ts          # POI 状态接口
│   ├── ferry.interface.ts               # 渡轮接口
│   └── hazard.interface.ts              # 危险区域接口
├── services/
│   └── spatial-issue-detector.service.ts  # 空间问题检测服务
└── strategies/
    └── neptune-strategy.service.ts      # Neptune 策略（已集成）
```

## 系统价值

你现在拥有：

✅ **自动空间问题检测**  
✅ **五类问题类型支持**  
✅ **数据源抽象接口**  
✅ **季节性判断逻辑**  
✅ **完整的测试场景**  
✅ **可扩展的架构设计**

**Neptune 现在真正能够"发现 issue"，而不仅仅是"修复 issue"。**

## 相关文档

- [Neptune Spatial Replacement](./NEPTUNE_SPATIAL_REPLACEMENT.md)
- [Strategy Contract System](./STRATEGY_CONTRACT_SYSTEM.md)

