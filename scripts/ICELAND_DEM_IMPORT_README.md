# 冰岛 DEM 20m 数据导入说明

## 📋 概述

本脚本用于将冰岛 20m 精度的 DEM（数字高程模型）数据导入到 PostGIS 数据库中。

**数据文件**: `IslandsDEMv1.0_20x20m_isn2016_zmasl.tif`
- **分辨率**: 20米
- **坐标系**: ISN2016 (SRID: 5327)
- **覆盖范围**: 冰岛全境

## 🚀 快速开始

### 1. 前置要求

确保已安装 PostGIS 工具：

```bash
# macOS
brew install postgis

# Ubuntu/Debian
sudo apt-get install postgis postgresql-14-postgis-3

# 验证安装
raster2pgsql --version
```

### 2. 设置环境变量

```bash
export DATABASE_URL="postgresql://user:password@host:port/database"
# 或从 .env 文件加载
export $(grep DATABASE_URL .env | xargs)
```

### 3. 运行导入脚本

```bash
# 基本导入（使用默认参数）
npx tsx scripts/import-iceland-dem-20m.ts

# 删除现有表后重新导入
npx tsx scripts/import-iceland-dem-20m.ts --drop-existing

# 预览命令（不实际执行）
npx tsx scripts/import-iceland-dem-20m.ts --dry-run

# 自定义参数
npx tsx scripts/import-iceland-dem-20m.ts \
  --file docs/iceland/geography/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif \
  --table geo_dem_iceland_20m \
  --srid 5327 \
  --tile-size 100x100
```

## 📊 导入后的表结构

导入后会创建表 `geo_dem_iceland_20m`，包含以下字段：

- `rid` (INTEGER): 行ID（主键）
- `rast` (RASTER): PostGIS 栅格数据
- `filename` (TEXT): 源文件名

## 🔍 验证导入

脚本会自动验证导入结果，包括：

1. **检查记录数**: 确认瓦片数量
2. **栅格信息**: 宽度、高度、比例、坐标系
3. **测试查询**: 使用雷克雅未克坐标测试查询

你也可以手动验证：

```sql
-- 检查记录数
SELECT COUNT(*) FROM geo_dem_iceland_20m;

-- 查看栅格信息
SELECT 
  ST_Width(rast) as width,
  ST_Height(rast) as height,
  ST_ScaleX(rast) as scale_x,
  ST_ScaleY(rast) as scale_y,
  ST_SRID(rast) as srid
FROM geo_dem_iceland_20m 
LIMIT 1;

-- 测试查询（雷克雅未克）
SELECT 
  ST_Value(rast, ST_Transform(ST_SetSRID(ST_MakePoint(-21.9426, 64.1466), 4326), 5327)) as elevation
FROM geo_dem_iceland_20m 
WHERE ST_Intersects(rast, ST_Transform(ST_SetSRID(ST_MakePoint(-21.9426, 64.1466), 4326), 5327))
LIMIT 1;
```

## 🔧 使用 DEMElevationService

导入后，`DEMElevationService` 会自动优先使用冰岛的高精度 DEM 数据：

```typescript
import { DEMElevationService } from './trips/dem/services/dem-elevation.service';

// 在服务中注入
constructor(private readonly demService: DEMElevationService) {}

// 查询海拔（自动使用冰岛20m数据）
const elevation = await this.demService.getElevation(64.1466, -21.9426);
// 如果坐标在冰岛范围内，会自动优先查询 geo_dem_iceland_20m 表
```

**查询优先级**：
1. ✅ `geo_dem_iceland_20m` - 冰岛20m精度（如果坐标在冰岛范围内）
2. `geo_dem_cities_merged` - 合并城市DEM表
3. `geo_dem_xizang` - 区域DEM表（后备）
4. `geo_dem_global` - 全球DEM表（最终后备）

## ⚙️ 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--file` | GeoTIFF 文件路径 | `docs/iceland/geography/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif` |
| `--table` | 表名 | `geo_dem_iceland_20m` |
| `--srid` | 坐标系 SRID | `5327` (ISN2016) |
| `--tile-size` | 瓦片大小 | `100x100` |
| `--drop-existing` | 删除现有表 | `false` |
| `--dry-run` | 仅显示命令 | `false` |

## 🐛 常见问题

### 1. 导入失败：raster2pgsql 未找到

**解决**: 安装 PostGIS
```bash
brew install postgis  # macOS
```

### 2. 导入失败：表已存在

**解决**: 使用 `--drop-existing` 参数
```bash
npx tsx scripts/import-iceland-dem-20m.ts --drop-existing
```

### 3. 导入很慢

**优化**: 增加瓦片大小
```bash
npx tsx scripts/import-iceland-dem-20m.ts --tile-size 200x200
```

### 4. 查询时坐标不匹配

**说明**: 冰岛DEM使用ISN2016坐标系（SRID 5327），查询时会自动转换坐标。`DEMElevationService` 已处理此问题。

## 📚 相关文档

- [详细导入指南](./ICELAND_DEM_IMPORT_GUIDE.md)
- [DEMElevationService 源码](../../src/trips/dem/services/dem-elevation.service.ts)
- [PostGIS Raster 文档](https://postgis.net/docs/RT_reference.html)

## ✅ 导入完成后的步骤

1. ✅ 验证导入结果（脚本自动完成）
2. ✅ 更新 Prisma schema（已更新）
3. ✅ 运行 `npx prisma generate` 更新 Prisma Client
4. ✅ 测试 DEMElevationService 查询

## 🎯 预期效果

导入完成后，冰岛地区的海拔查询将：
- ✅ 使用 20m 精度数据（比全球DEM的30m或90m更精确）
- ✅ 自动优先查询（无需手动指定表）
- ✅ 支持坐标自动转换（ISN2016 ↔ WGS84）
