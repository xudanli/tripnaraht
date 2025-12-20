# 全球山脉地理数据存放目录

## 📁 目录结构

请将全球山脉数据按以下结构放置：

```
data/geographic/mountains/
├── inventory_standard/          # 标准版本山脉库存（推荐）
│   ├── GMBA_Inventory_v2.0_standard.shp
│   ├── GMBA_Inventory_v2.0_standard.shx
│   ├── GMBA_Inventory_v2.0_standard.dbf
│   ├── GMBA_Inventory_v2.0_standard.prj      # ⚠️ 必需：坐标系定义
│   └── ... (其他配套文件)
├── inventory_standard_300/      # 300米分辨率版本（可选，更详细）
│   ├── GMBA_Inventory_v2.0_standard_300.shp
│   ├── GMBA_Inventory_v2.0_standard_300.shx
│   ├── GMBA_Inventory_v2.0_standard_300.dbf
│   └── GMBA_Inventory_v2.0_standard_300.prj
├── inventory_broad/             # 宽泛版本（可选）
│   ├── GMBA_Inventory_v2.0_broad.shp
│   ├── GMBA_Inventory_v2.0_broad.shx
│   ├── GMBA_Inventory_v2.0_broad.dbf
│   └── GMBA_Inventory_v2.0_broad.prj
└── definition/                  # 栅格定义文件（可选，用于高级分析）
    └── GMBA_Definition_v2.0.tif
```

## 📋 需要哪些文件？

### ✅ 必需文件（用于 PostGIS 导入）

**推荐使用：`inventory_standard` 或 `inventory_standard_300`**

每个 Shapefile 必须包含：
- **`.shp`** - 几何数据（面状多边形）
- **`.shx`** - 空间索引
- **`.dbf`** - 属性表（包含山脉名称、海拔等信息）
- **`.prj`** - 坐标系定义（**非常关键**）

### 📊 版本选择建议

1. **`inventory_standard`** - 标准版本
   - 适合大多数用途
   - 数据量适中
   - 推荐用于一般查询

2. **`inventory_standard_300`** - 300米分辨率
   - 更详细，精度更高
   - 数据量较大
   - 适合需要高精度的场景

3. **`inventory_broad`** - 宽泛版本
   - 数据量较小
   - 适合快速查询
   - 精度较低

### 🗜️ 压缩格式

**支持压缩包格式**：`.zip` 或 `.7z`

压缩包内应保持上述目录结构。

## 📋 数据用途

### 山脉特征计算

1. **inMountain** - 点位是否在山脉区域内
2. **mountainElevation** - 点位所在山脉的平均/最高海拔
3. **mountainDensityScore** - 山脉密度评分（区域内山脉覆盖比例）
4. **terrainComplexity** - 地形复杂度（基于山脉分布）

### 与河网数据结合

- **高海拔 + 河网密集** → 峡谷/河谷地形
- **山脉 + 雨季** → 山洪/滑坡风险
- **高海拔 + 路线穿越** → 高难度路线

## 🚀 下一步

1. 将数据文件放置到对应目录
2. 运行导入脚本：`npm run import:mountains` 或 `ts-node scripts/import-mountains-to-postgis.ts`
3. 数据会自动导入到 PostGIS 数据库

## 📝 注意事项

- 确保 `.prj` 文件存在，否则无法正确识别坐标系
- 如果坐标系不是 EPSG:4326（WGS84），导入脚本会自动转换
- 导入前建议检查 `.dbf` 文件中的字段，了解有哪些属性可用（如山脉名称、海拔范围等）

