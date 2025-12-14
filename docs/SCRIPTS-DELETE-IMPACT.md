# 删除 scripts 文件夹的后果分析

## ⚠️ 严重后果

### 1. **43 个 npm scripts 命令将失效**

package.json 中有 **43 个命令**引用了 scripts/ 下的文件，删除后这些命令都会报错：

```bash
# 这些命令都会失败
npm run scrape              # ❌ 找不到 scripts/scrape-places.ts
npm run seed                # ❌ 找不到 scripts/seed-places.ts
npm run import:airports     # ❌ 找不到 scripts/import-airports.ts
npm run import:alltrails    # ❌ 找不到 scripts/import-alltrails-to-db.ts
npm run import:cities       # ❌ 找不到 scripts/import-cities-to-db.ts
# ... 还有 38 个命令
```

### 2. **无法进行数据导入/迁移**

以下功能将无法使用：
- ❌ 导入机场数据 (`import:airports`)
- ❌ 导入城市数据 (`import:cities`, `import:cities:csv`)
- ❌ 导入景点数据 (`import:attractions`)
- ❌ 导入酒店数据 (`import:hotels`)
- ❌ 导入火车站数据 (`import:train-stations`)
- ❌ 导入自然 POI (`import:nature-poi`)
- ❌ 导入 AllTrails 数据 (`import:alltrails`)

### 3. **无法进行数据抓取**

以下功能将无法使用：
- ❌ 抓取 AllTrails 数据 (`scrape:alltrails`)
- ❌ 抓取马蜂窝数据 (`scrape:mafengwo`)
- ❌ 抓取飞猪数据 (`scrape:fliggy`)
- ❌ 抓取签证数据 (`scrape:visa`)

### 4. **无法进行数据维护**

以下功能将无法使用：
- ❌ 数据种子填充 (`seed`, `seed:visa`, `seed:flight-prices`)
- ❌ 数据清理 (`clear:flight-prices`, `clear:test-data`)
- ❌ 数据检查 (`check:visa`, `check:data-columns`)
- ❌ 数据更新 (`update:alltrails:elevation`, `update:potala`)
- ❌ 数据转换 (`convert:attractions`, `convert:train-stations`)

### 5. **无法进行数据增强**

以下功能将无法使用：
- ❌ 从高德地图增强数据 (`enrich:attractions`, `enrich:amap`)
- ❌ 生成物理元数据 (`generate:physical-metadata`)
- ❌ 填充英文名称 (`fill:name-en`)

---

## ✅ 不会影响的功能

### 生产环境运行
- ✅ **不影响**：后端服务正常运行（`backend:dev`, `backend:build`, `backend:start`）
- ✅ **不影响**：前端应用正常运行（`dev`, `build`, `start`）
- ✅ **不影响**：数据库迁移（`prisma:migrate`）
- ✅ **不影响**：Prisma Studio（`prisma:studio`）

**原因**：这些脚本是**开发和维护工具**，不是生产运行时的必需文件。

---

## 📊 影响统计

### 受影响的 npm scripts（43个）

#### 数据导入（8个）
- `import:airports`
- `import:cities`
- `import:cities:csv`
- `import:attractions`
- `import:hotels`
- `import:train-stations`
- `import:nature-poi`
- `import:alltrails`
- `import:flight-data`
- `import:flight-data:streaming`

#### 数据抓取（6个）
- `scrape`
- `scrape:visa`
- `scrape:mafengwo`
- `scrape:fliggy`
- `scrape:alltrails`
- `scrape:alltrails:puppeteer`
- `scrape:alltrails:batch`
- `scrape:tibet`

#### 数据种子（3个）
- `seed`
- `seed:payment-profiles`
- `seed:visa`
- `seed:flight-prices`

#### 数据清理（3个）
- `clear:flight-prices`
- `clear:flight-price-data`
- `clear:test-data`

#### 数据检查（3个）
- `check:visa`
- `verify:flight-data`
- `check:data-columns`

#### 数据转换（3个）
- `convert:excel-to-csv`
- `convert:attractions`
- `convert:train-stations`
- `convert:cities`

#### 数据更新（3个）
- `update:attractions`
- `update:alltrails:elevation`
- `update:potala`

#### 数据增强（4个）
- `enrich:attractions`
- `enrich:amap`
- `fill:name-en`
- `generate:physical-metadata`

#### 其他工具（4个）
- `diagnose:poi`
- `fix:coordinates`
- `optimize:countries`
- `create:flight-table`

---

## 🎯 建议

### ❌ 不建议删除所有 scripts

**原因**：
1. 这些脚本是**重要的开发和维护工具**
2. 删除后无法进行数据导入/迁移
3. 删除后无法进行数据抓取和维护
4. 43 个 npm scripts 会全部失效

### ✅ 建议只删除以下文件

#### 1. 测试脚本（7个）- 可以删除
```bash
scripts/test-assistant-apis.ts
scripts/test-whatif-api.ts
scripts/test-whatif-other-apis.ts
scripts/test-whatif-api-with-placeids.ts
scripts/test-mafengwo-extraction.ts
scripts/test-placeids-direct.sh
scripts/test-whatif-simple.sh
```

#### 2. 检查脚本（2个）- 可选删除
```bash
scripts/check-attractions-data.ts
scripts/check-trail-difficulty-data.ts
```

#### 3. 重复脚本 - 需要检查
```bash
# 检查这两个是否重复，保留功能更完整的
scripts/import-airports.ts
scripts/import-airports-from-google.ts
```

### 📝 如果必须删除所有 scripts

**需要做的准备工作**：

1. **备份所有脚本**
   ```bash
   cp -r scripts scripts_backup
   ```

2. **更新 package.json**
   - 删除或注释掉所有引用 scripts/ 的命令
   - 或者创建占位符脚本

3. **记录脚本功能**
   - 将重要脚本的功能记录到文档中
   - 以便未来需要时重新实现

4. **考虑迁移到独立工具**
   - 将数据导入/迁移脚本移到独立的工具仓库
   - 使用 CLI 工具管理

---

## 🔄 替代方案

### 方案 1：移动到独立目录
```bash
# 将 scripts 重命名为 tools 或 maintenance
mv scripts tools
# 更新 package.json 中的路径
```

### 方案 2：只保留必要的脚本
```bash
# 只保留在 package.json 中被引用的脚本
# 删除所有 test-*.ts 和 check-*.ts
```

### 方案 3：归档旧脚本
```bash
# 创建 archive 目录
mkdir scripts/archive
# 移动不常用的脚本到 archive
mv scripts/test-*.ts scripts/archive/
mv scripts/check-*.ts scripts/archive/
```

---

## 📋 总结

**删除所有 scripts 的后果**：
- ❌ **43 个 npm scripts 失效**
- ❌ **无法进行数据导入/迁移**
- ❌ **无法进行数据抓取和维护**
- ✅ **不影响生产环境运行**

**建议**：
- ⚠️ **不要删除所有 scripts**
- ✅ **只删除测试脚本和检查脚本**
- ✅ **保留所有数据导入/抓取/维护脚本**
