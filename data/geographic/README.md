# 地理数据目录

## 📁 目录结构

```
data/geographic/
├── rivers/              # 河网数据
│   ├── rivers_line/     # 线状水系
│   ├── water_poly/      # 面状水系
│   └── country/         # 国家边界（可选）
├── mountains/           # 山脉数据
│   ├── inventory_standard/      # 标准版本（推荐）
│   ├── inventory_standard_300/ # 300米版本（可选）
│   └── inventory_broad/         # 宽泛版本（可选）
├── roads/               # 道路网络数据
│   ├── roads/           # 世界道路
│   └── railways/        # 世界铁路（可选）
└── coastlines/          # 海岸线数据
    └── lines.*          # 海岸线 Shapefile
```

## 📋 需要哪些文件？

### 河网数据（已导入 ✅）

**必需文件**：
- `rivers_line/世界线状水系.*` (`.shp`, `.shx`, `.dbf`, `.prj`)
- `water_poly/世界面状水系.*` (`.shp`, `.shx`, `.dbf`, `.prj`)

### 山脉数据（待导入）

**必需文件**（从 `C7全球山脉数据库` 文件夹中复制）：

#### 标准版本（推荐）

从 `1.GMBA_Inventory_v2.0_standard` 文件夹复制到 `mountains/inventory_standard/`：

- ✅ `GMBA_Inventory_v2.0_standard.shp`
- ✅ `GMBA_Inventory_v2.0_standard.shx`
- ✅ `GMBA_Inventory_v2.0_standard.dbf`
- ✅ `GMBA_Inventory_v2.0_standard.prj` ⚠️ **必需**
- ✅ `GMBA_Inventory_v2.0_standard.CPG` (可选)
- ✅ `GMBA_Inventory_v2.0_standard.sbn/.sbx` (可选，空间索引)

#### 可选版本

- **300米版本**：从 `4.GMBA_Inventory_v2.0_standard_300` 复制到 `mountains/inventory_standard_300/`
- **宽泛版本**：从 `3.GMBA_Inventory_v2.0_broad` 复制到 `mountains/inventory_broad/`

### 道路网络数据（待导入）

**必需文件**（从 `世界铁路和道路` 文件夹中复制）：

#### 世界道路（必需）

从 `世界铁路和道路` 文件夹复制到 `roads/roads/`：

- ✅ `世界道路.shp`
- ✅ `世界道路.shx`
- ✅ `世界道路.dbf`
- ✅ `世界道路.prj` ⚠️ **必需**

#### 世界铁路（可选）

如果需要铁路数据，复制到 `roads/railways/`：

- ✅ `世界铁路.shp`
- ✅ `世界铁路.shx`
- ✅ `世界铁路.dbf`
- ✅ `世界铁路.prj` ⚠️ **必需**

### 4. 海岸线数据（待导入）

**必需文件**（从海岸线数据文件夹中复制）：

#### 海岸线（必需）

从海岸线数据文件夹复制到 `coastlines/`：

- ✅ `lines.shp`
- ✅ `lines.shx`
- ✅ `lines.dbf`
- ✅ `lines.prj` ⚠️ **必需**

### ❌ 不需要的文件

- `2.GMBA_Definition_v2.0` - 栅格文件（`.tif`），PostGIS 主要处理矢量数据，暂不需要

## 🚀 快速开始

### 1. 放置文件

将山脉数据文件按上述结构放置到对应目录。

### 2. 导入数据

```bash
# 导入河网数据（已完成 ✅）
npx ts-node --project tsconfig.backend.json scripts/import-rivers-to-postgis.ts

# 导入山脉数据
npx ts-node --project tsconfig.backend.json scripts/import-mountains-to-postgis.ts

# 导入道路网络数据
npx ts-node --project tsconfig.backend.json scripts/import-roads-to-postgis.ts

# 导入海岸线数据
npx ts-node --project tsconfig.backend.json scripts/import-coastlines-to-postgis.ts
```

### 3. 验证导入

```bash
# 验证数据
npx ts-node --project tsconfig.backend.json scripts/verify-rivers-import.ts
```

## 📚 详细文档

- [河网数据指南](./rivers/README.md)
- [山脉数据指南](./mountains/README.md)
- [道路网络数据指南](./roads/README.md)
- [海岸线数据指南](./coastlines/README.md)
- [综合使用指南](../../src/trips/readiness/GEO_DATA_GUIDE.md)

