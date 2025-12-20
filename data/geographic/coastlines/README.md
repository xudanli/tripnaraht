# 世界海岸线数据存放目录

## 📁 目录结构

请将世界海岸线数据按以下结构放置：

```
data/geographic/coastlines/
├── lines.shp
├── lines.shx
├── lines.dbf
└── lines.prj      # ⚠️ 必需：坐标系定义
```

## 📋 需要哪些文件？

### ✅ 必需文件（用于 PostGIS 导入）

从你的海岸线数据文件夹中，复制以下文件到 `data/geographic/coastlines/`：

- ✅ `lines.shp` - 几何数据（线状海岸线）
- ✅ `lines.shx` - 空间索引
- ✅ `lines.dbf` - 属性表
- ✅ `lines.prj` - 坐标系定义（**非常关键**）

**可选文件**：
- `.cpg` - 编码文件
- `.shp.xml` - 元数据
- `.sbn/.sbx` - 空间索引（有的话查询更快）

### ⚠️ 重要提示

1. **`.prj` 文件必需**：没有这个文件，无法正确识别坐标系
2. **4个文件缺一不可**：`.shp`, `.shx`, `.dbf`, `.prj`
3. **保持文件名一致**：不要重命名文件

## 📋 数据用途

### 海岸线特征计算

1. **nearCoastline** - 点位是否靠近海岸线
2. **nearestCoastlineDistanceM** - 到最近海岸线的距离
3. **coastlineDensityScore** - 海岸线密度评分（区域内海岸线总长度）
4. **isCoastalArea** - 是否在沿海区域

### 与河网、山脉、道路数据结合

- **海岸线 + 河网** → 河口/三角洲区域识别
- **海岸线 + 山脉** → 海岸山脉/悬崖地形
- **海岸线 + 道路** → 沿海公路/旅游路线
- **海岸线 + 河网 + 山脉** → 综合地形评估

## 🚀 下一步

1. 将数据文件放置到对应目录
2. 运行导入脚本：`npx ts-node --project tsconfig.backend.json scripts/import-coastlines-to-postgis.ts`
3. 数据会自动导入到 PostGIS 数据库

## 📝 注意事项

- 确保 `.prj` 文件存在，否则无法正确识别坐标系
- 如果坐标系不是 EPSG:4326（WGS84），导入脚本会自动转换
- 导入前建议检查 `.dbf` 文件中的字段，了解有哪些属性可用

