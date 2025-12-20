# 需要哪些文件？

## 📋 从你的 `C7全球山脉数据库` 文件夹中复制

### ✅ 必需：标准版本

**从 `1.GMBA_Inventory_v2.0_standard` 文件夹复制以下文件到 `data/geographic/mountains/inventory_standard/`：**

```
1.GMBA_Inventory_v2.0_standard/
├── GMBA_Inventory_v2.0_standard.shp  ✅ 必需
├── GMBA_Inventory_v2.0_standard.shx  ✅ 必需
├── GMBA_Inventory_v2.0_standard.dbf  ✅ 必需
├── GMBA_Inventory_v2.0_standard.prj  ✅ 必需（非常关键！）
├── GMBA_Inventory_v2.0_standard.CPG  （可选）
├── GMBA_Inventory_v2.0_standard.sbn  （可选）
└── GMBA_Inventory_v2.0_standard.sbx  （可选）
```

### 📁 目标位置

复制后，文件应该在这里：

```
data/geographic/mountains/inventory_standard/
├── GMBA_Inventory_v2.0_standard.shp
├── GMBA_Inventory_v2.0_standard.shx
├── GMBA_Inventory_v2.0_standard.dbf
└── GMBA_Inventory_v2.0_standard.prj
```

### ⚠️ 重要提示

1. **`.prj` 文件必需**：没有这个文件，无法正确识别坐标系
2. **4个文件缺一不可**：`.shp`, `.shx`, `.dbf`, `.prj`
3. **保持文件名一致**：不要重命名文件

### 🚀 导入命令

文件放置好后，运行：

```bash
npx ts-node --project tsconfig.backend.json scripts/import-mountains-to-postgis.ts
```

