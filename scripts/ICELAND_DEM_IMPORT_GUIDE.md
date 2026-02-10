# 冰岛 DEM 20m 数据导入指南

## 概述

本指南说明如何将 `IslandsDEMv1.0_20x20m_isn2016_zmasl.tif` 文件导入到 PostGIS 数据库中。

## 前置要求

### 1. 安装 PostGIS 工具

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgis postgresql-14-postgis-3  # 根据你的 PostgreSQL 版本调整
```

**macOS:**
```bash
brew install postgis
```

**验证安装:**
```bash
raster2pgsql --version
```

### 2. 准备文件

确保 DEM 文件位于：
```
data/iceland/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif
```

### 3. 设置数据库连接

确保 `DATABASE_URL` 环境变量已设置：
```bash
export DATABASE_URL='postgresql://user:password@host:port/database'
```

或者从 `.env` 文件加载：
```bash
export $(grep DATABASE_URL .env | xargs)
```

## 方法 1: 使用导入脚本（推荐）

### 步骤 1: 运行导入脚本

```bash
cd /home/devbox/project
export $(grep DATABASE_URL .env | xargs)  # 如果使用 .env 文件
bash scripts/import-iceland-dem-20m.sh
```

脚本会：
- ✅ 检查文件是否存在
- ✅ 检查 `raster2pgsql` 是否安装
- ✅ 解析数据库连接信息
- ✅ 询问是否删除现有表（如果存在）
- ✅ 执行导入
- ✅ 验证导入结果

### 步骤 2: 确认导入

当脚本询问时，输入 `y` 确认导入。

## 方法 2: 手动导入（直接使用 raster2pgsql）

### 步骤 1: 准备导入命令

```bash
# 设置变量
DEM_FILE="data/iceland/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif"
TABLE_NAME="geo_dem_iceland_20m"
SRID=5327  # ISN2016 坐标系

# 如果表已存在，先删除（可选）
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS $TABLE_NAME CASCADE;"
```

### 步骤 2: 执行导入

```bash
raster2pgsql \
  -s $SRID \
  -I \
  -C \
  -M \
  -F \
  -t 100x100 \
  -R \
  "$DEM_FILE" \
  "$TABLE_NAME" | psql "$DATABASE_URL"
```

### 参数说明

| 参数 | 说明 |
|------|------|
| `-s 5327` | ISN2016 坐标系 SRID（如果文件使用 WGS84，使用 `-s 4326`） |
| `-I` | 创建空间索引（GIST） |
| `-C` | 应用约束 |
| `-M` | 更新统计信息 |
| `-F` | 添加文件名列 |
| `-t 100x100` | 瓦片大小（100x100 像素），可根据文件大小调整 |
| `-R` | 注册栅格（在 raster_columns 表中注册） |

### 步骤 3: 验证导入

```bash
# 检查行数
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM $TABLE_NAME;"

# 检查栅格信息
psql "$DATABASE_URL" -c "
SELECT 
  COUNT(*) as tile_count,
  ST_Width(rast) as width,
  ST_Height(rast) as height,
  ST_ScaleX(rast) as scale_x,
  ST_ScaleY(rast) as scale_y,
  ST_SRID(rast) as srid
FROM $TABLE_NAME 
LIMIT 1;
"

# 测试查询（雷克雅未克坐标）
psql "$DATABASE_URL" -c "
SELECT 
  ST_Value(rast, ST_SetSRID(ST_MakePoint(-21.9426, 64.1466), 5327)) as elevation
FROM $TABLE_NAME 
WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(-21.9426, 64.1466), 5327))
LIMIT 1;
"
```

## 方法 3: 使用 Python 脚本（如果需要坐标转换）

如果文件使用不同的坐标系，可能需要先转换：

```python
#!/usr/bin/env python3
"""
使用 GDAL 转换坐标系并导入
"""
import subprocess
import os

# 如果文件不是 ISN2016，先转换
input_file = "data/iceland/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif"
output_file = "data/iceland/IslandsDEMv1.0_20x20m_wgs84.tif"

# 转换到 WGS84 (EPSG:4326)
subprocess.run([
    "gdalwarp",
    "-t_srs", "EPSG:4326",
    "-r", "bilinear",
    input_file,
    output_file
])

# 然后导入转换后的文件
subprocess.run([
    "raster2pgsql",
    "-s", "4326",
    "-I", "-C", "-M", "-F",
    "-t", "100x100",
    "-R",
    output_file,
    "geo_dem_iceland_20m"
], stdout=subprocess.PIPE)
```

## 坐标系说明

### ISN2016 (SRID: 5327)

- **名称**: ISN2016 (Icelandic National Grid 2016)
- **用途**: 冰岛国家坐标系
- **精度**: 高精度，适合冰岛本地数据

### WGS84 (SRID: 4326)

- **名称**: WGS84 (World Geodetic System 1984)
- **用途**: 全球通用坐标系
- **兼容性**: 与系统其他数据兼容性更好

**注意**: 如果文件使用 ISN2016，但系统其他数据使用 WGS84，查询时需要坐标转换：

```sql
-- 查询时转换坐标
SELECT ST_Value(
  rast, 
  ST_Transform(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 5327)
) as elevation
FROM geo_dem_iceland_20m
WHERE ST_Intersects(
  rast, 
  ST_Transform(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 5327)
);
```

## 常见问题

### 1. 导入失败：表已存在

**解决方案**:
```bash
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS geo_dem_iceland_20m CASCADE;"
# 然后重新导入
```

### 2. 导入失败：权限不足

**解决方案**:
```bash
# 确保数据库用户有创建表的权限
psql "$DATABASE_URL" -c "GRANT CREATE ON SCHEMA public TO your_user;"
```

### 3. 导入失败：坐标系不匹配

**解决方案**:
- 检查文件的坐标系：`gdalinfo data/iceland/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif`
- 如果文件使用 WGS84，将 `-s 5327` 改为 `-s 4326`

### 4. 导入很慢

**优化建议**:
- 增加瓦片大小：`-t 200x200` 或 `-t 500x500`
- 减少约束：移除 `-C` 参数（不推荐）
- 分批导入：使用 `-Y` 参数分批处理

### 5. 查询时坐标不匹配

**解决方案**:
- 确保查询时使用正确的坐标系
- 如果 DEM 使用 ISN2016，查询时需要转换坐标
- 或者将 DEM 转换为 WGS84 后再导入

## 导入后步骤

### 1. 更新 DEMElevationService

修改 `src/trips/dem/services/dem-elevation.service.ts`，添加冰岛专用表的查询优先级：

```typescript
// 在 getElevation 方法中添加
async getElevation(lat: number, lng: number): Promise<number | null> {
  // 1. 优先查询 geo_dem_iceland_20m（冰岛专用高精度）
  const icelandResult = await this.queryDEMTable('geo_dem_iceland_20m', lat, lng);
  if (icelandResult !== null) return icelandResult;
  
  // 2. 后备查询 geo_dem_cities_merged（城市数据）
  const citiesResult = await this.queryDEMTable('geo_dem_cities_merged', lat, lng);
  if (citiesResult !== null) return citiesResult;
  
  // 3. 最终后备 geo_dem_global（全球数据）
  return await this.queryDEMTable('geo_dem_global', lat, lng);
}
```

### 2. 验证精度提升

运行测试脚本：
```bash
npx tsx scripts/test-iceland-dem-direct.ts
```

### 3. 更新 Prisma Schema（可选）

如果需要通过 Prisma 访问，在 `prisma/schema.prisma` 中添加：

```prisma
model geo_dem_iceland_20m {
  rid      Int                    @id @default(autoincrement())
  rast     Unsupported("raster")?
  filename String?

  @@ignore
}
```

然后运行：
```bash
npx prisma generate
```

## 完整示例

```bash
#!/bin/bash
# 完整导入流程

# 1. 设置环境变量
export $(grep DATABASE_URL .env | xargs)

# 2. 删除现有表（如果存在）
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS geo_dem_iceland_20m CASCADE;"

# 3. 导入数据
raster2pgsql \
  -s 5327 \
  -I -C -M -F \
  -t 100x100 \
  -R \
  data/iceland/IslandsDEMv1.0_20x20m_isn2016_zmasl.tif \
  geo_dem_iceland_20m | psql "$DATABASE_URL"

# 4. 验证导入
echo "验证导入结果..."
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM geo_dem_iceland_20m;"

# 5. 测试查询
echo "测试查询..."
psql "$DATABASE_URL" -c "
SELECT 
  ST_Value(rast, ST_SetSRID(ST_MakePoint(-21.9426, 64.1466), 5327)) as elevation
FROM geo_dem_iceland_20m 
WHERE ST_Intersects(rast, ST_SetSRID(ST_MakePoint(-21.9426, 64.1466), 5327))
LIMIT 1;
"

echo "✅ 导入完成！"
```

## 参考资源

- [PostGIS Raster 文档](https://postgis.net/docs/RT_reference.html)
- [raster2pgsql 文档](https://postgis.net/docs/using_raster_dataman.html#RT_Raster_Loader)
- [ISN2016 坐标系信息](https://epsg.io/5327)
