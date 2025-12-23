# 代码清理报告

## 📋 概述

本报告列出了项目中未使用的接口、已废弃的方法和可以删除的文件。

## 🗑️ 可以删除的接口和文件

### 1. 未实现的适配器接口（预埋接口，暂无实现）

#### TransportAdapter 相关
- **文件**: `src/data-contracts/adapters/transport.adapter.interface.ts`
- **状态**: ⚠️ 接口已定义，但没有任何实现
- **使用情况**: 
  - 在 `DataSourceRouterService` 中有注册方法，但从未被调用
  - 没有任何适配器实现这个接口
  - `getTransportSchedule` 方法存在但从未被使用
- **建议**: 
  - **选项 A（推荐）**: 保留接口，但添加注释说明这是预埋接口，待实现
  - **选项 B**: 如果确定近期不会实现，可以删除相关代码

#### FerryAdapter 相关
- **文件**: `src/data-contracts/adapters/ferry.adapter.interface.ts`
- **状态**: ⚠️ 接口已定义，但没有任何实现
- **使用情况**: 
  - 在 `DataSourceRouterService` 中有注册方法，但从未被调用
  - 没有任何适配器实现这个接口
  - `getFerrySchedule` 方法存在但从未被使用
- **建议**: 
  - **选项 A（推荐）**: 保留接口，但添加注释说明这是预埋接口，待实现
  - **选项 B**: 如果确定近期不会实现，可以删除相关代码

#### TransportSchedule 和 FerrySchedule 接口
- **文件**: 
  - `src/data-contracts/interfaces/transport-schedule.interface.ts`
  - `src/data-contracts/interfaces/ferry-schedule.interface.ts`
- **状态**: ⚠️ 接口已定义，但没有任何实际使用
- **使用情况**: 
  - 只在接口定义和 `DataSourceRouterService` 的类型声明中使用
  - 没有实际的业务逻辑使用这些接口
- **建议**: 
  - 如果删除 TransportAdapter 和 FerryAdapter，这些接口也可以删除
  - 或者保留作为未来实现的规范

### 2. 已废弃的方法（可以删除）

#### DEMElevationService.findCityDEMTables
- **文件**: `src/trips/readiness/services/dem-elevation.service.ts`
- **行号**: 30-61
- **状态**: ✅ 已标记为 `@deprecated`
- **原因**: 已改用合并表 `geo_dem_cities_merged`
- **建议**: 可以删除此方法，因为已有更好的实现

#### GooglePlacesService.searchPlacesInCity
- **文件**: `src/places/services/google-places.service.ts`
- **行号**: 154-176
- **状态**: ✅ 已标记为"已废弃"
- **原因**: 使用 `buildMergedQuery + searchPlacesByText` 替代
- **建议**: 可以删除此方法，因为已有更好的实现

## 📊 统计

### 未使用的接口文件
- `transport.adapter.interface.ts` - 0 个实现
- `ferry.adapter.interface.ts` - 0 个实现
- `transport-schedule.interface.ts` - 仅类型定义，无实际使用
- `ferry-schedule.interface.ts` - 仅类型定义，无实际使用

### 已废弃的方法
- `findCityDEMTables` - 1 个方法
- `searchPlacesInCity` - 1 个方法

### DataSourceRouterService 中未使用的方法
- `registerTransportAdapter` - 从未被调用
- `registerFerryAdapter` - 从未被调用
- `getTransportSchedule` - 从未被调用
- `getFerrySchedule` - 从未被调用
- `selectTransportAdapter` - 从未被调用
- `selectFerryAdapter` - 从未被调用

## 🎯 清理建议

### 方案 A：保守清理（推荐）
1. **保留预埋接口**，但添加清晰的注释说明状态
2. **删除已废弃的方法**（`findCityDEMTables` 和 `searchPlacesInCity`）
3. **在 DataSourceRouterService 中添加 TODO 注释**，说明 Transport 和 Ferry 适配器待实现

### 方案 B：激进清理
1. **删除所有 Transport 和 Ferry 相关接口**
2. **删除 DataSourceRouterService 中的相关方法**
3. **删除已废弃的方法**
4. **更新 README 文档**，移除相关说明

## 📝 具体操作步骤

### 如果选择方案 A（推荐）

1. **删除已废弃的方法**:
   ```bash
   # 删除 findCityDEMTables 方法
   # 删除 searchPlacesInCity 方法
   ```

2. **添加注释到预埋接口**:
   ```typescript
   /**
    * 公共交通适配器接口
    * 
    * @deprecated 预埋接口，暂无实现。待实现时再启用。
    * 相关方法：registerTransportAdapter, getTransportSchedule
    */
   ```

3. **在 DataSourceRouterService 中添加 TODO**:
   ```typescript
   /**
    * 注册公共交通适配器
    * 
    * @todo 待实现 TransportAdapter 后启用
    */
   registerTransportAdapter(adapter: TransportAdapter): void {
     // ...
   }
   ```

### 如果选择方案 B（激进）

1. **删除文件**:
   - `src/data-contracts/adapters/transport.adapter.interface.ts`
   - `src/data-contracts/adapters/ferry.adapter.interface.ts`
   - `src/data-contracts/interfaces/transport-schedule.interface.ts`
   - `src/data-contracts/interfaces/ferry-schedule.interface.ts`

2. **从 DataSourceRouterService 中删除**:
   - TransportAdapter 相关导入和方法
   - FerryAdapter 相关导入和方法

3. **更新文档**:
   - 从 README 中移除 Transport 和 Ferry 相关说明

## ⚠️ 注意事项

1. **Transport 和 Ferry 适配器**是架构设计的一部分，虽然目前未实现，但可能是未来需要的功能
2. **建议保留接口定义**，但添加清晰的注释说明当前状态
3. **已废弃的方法**可以安全删除，因为已有替代实现
4. **删除前请确认**没有其他代码或文档引用这些接口

## 🔍 检查清单

- [ ] 确认 TransportAdapter 和 FerryAdapter 确实没有实现
- [ ] 确认没有其他模块引用这些接口
- [ ] 确认已废弃的方法确实不再使用
- [ ] 更新相关文档
- [ ] 运行测试确保没有破坏性更改

