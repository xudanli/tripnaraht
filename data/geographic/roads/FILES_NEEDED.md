# 需要哪些文件？

## 📋 从你的 `世界铁路和道路` 文件夹中复制

### ✅ 必需：世界道路

**从 `世界铁路和道路` 文件夹复制以下文件到 `data/geographic/roads/roads/`：**

```
世界铁路和道路/
├── 世界道路.shp  ✅ 必需
├── 世界道路.shx  ✅ 必需
├── 世界道路.dbf  ✅ 必需
├── 世界道路.prj  ✅ 必需（非常关键！）
└── 世界道路.shp.xml  （可选）
```

### 📁 目标位置

复制后，文件应该在这里：

```
data/geographic/roads/roads/
├── 世界道路.shp
├── 世界道路.shx
├── 世界道路.dbf
└── 世界道路.prj
```

### ✅ 可选：世界铁路

如果需要铁路数据，复制以下文件到 `data/geographic/roads/railways/`：

```
世界铁路和道路/
├── 世界铁路.shp  ✅ 必需
├── 世界铁路.shx  ✅ 必需
├── 世界铁路.dbf  ✅ 必需
├── 世界铁路.prj  ✅ 必需（非常关键！）
└── 世界铁路.shp.xml  （可选）
```

### ⚠️ 重要提示

1. **`.prj` 文件必需**：没有这个文件，无法正确识别坐标系
2. **4个文件缺一不可**：`.shp`, `.shx`, `.dbf`, `.prj`
3. **保持文件名一致**：不要重命名文件

### 🚀 导入命令

文件放置好后，运行：

```bash
# 导入道路数据
npx ts-node --project tsconfig.backend.json scripts/import-roads-to-postgis.ts
```

