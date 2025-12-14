# 城市数据导入脚本（Python）

简单的 Python 脚本，用于将城市数据文件导入到 PostgreSQL 数据库。

## 安装依赖

```bash
pip install -r requirements.txt
```

## 配置数据库连接

创建 `.env` 文件（在项目根目录）：

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=your_password
```

或者直接在 `import_cities.py` 中修改 `DB_CONFIG` 字典。

## 使用方法

```bash
python import_cities.py <数据文件路径>
```

### 支持的文件格式

- **CSV** (.csv)
- **Excel** (.xlsx, .xls)
- **JSON** (.json) - 数组格式或 `{"cities": [...]}` 格式

### 示例

```bash
# 导入 CSV 文件
python import_cities.py cities.csv

# 导入 Excel 文件
python import_cities.py cities.xlsx

# 导入 JSON 文件
python import_cities.py cities.json
```

## 字段映射

脚本会自动识别以下字段名（按优先级）：

### 必需字段

- **城市名称**: `NAME`, `name`, `city`, `cityName`, `城市名称`
- **国家代码**: `ISO_A2`, `countryCode`, `country_code`, `iso_code`, `国家代码`

### 可选字段

- **中文名称**: `NAME_ZH`, `NAME_ZHT`, `nameCN`, `name_zh`, `中文名称`
- **英文名称**: `NAME_EN`, `nameEN`, `name_en`, `英文名称`
- **纬度**: `纬度`, `LAT`, `latitude`, `lat`, `y`
- **经度**: `经度`, `LNG`, `LON`, `longitude`, `lng`, `lon`, `x`
- **时区**: `TIMEZONE`, `TIMEZO`, `timezone`, `timeZone`, `时区`
- **行政区划代码**: `adcode`, `ad_code`, `admin_code`, `行政区划代码`

### Metadata 字段（自动存储到 metadata JSONB）

- **行政区划**: `ADM0NAME` (国家), `ADM1NAME` (省/州)
- **外部ID**: `WIKIDATAID`, `GEONAMESID`, `WOF_ID`
- **其他语言**: `NAME_DE`, `NAME_ES`, `NAME_FR`, `NAME_JA`, `NAME_KO`
- **要素分类**: `FEATURECLA`

## 功能特性

- ✅ 自动识别多种字段名
- ✅ 自动去重（相同 name + countryCode 会跳过）
- ✅ 支持 PostGIS 坐标（自动转换为 Point）
- ✅ 批量导入（每 100 条提交一次）
- ✅ 错误处理和进度显示
- ✅ 支持 CSV、Excel、JSON 格式

## 注意事项

1. 确保数据库已运行迁移，包含新字段（nameCN, nameEN, location, timezone, metadata）
2. 国家代码必须是 2 位大写字母（ISO 3166-1 alpha-2）
3. 坐标范围：纬度 -90 到 90，经度 -180 到 180
4. 如果提供坐标，必须同时提供纬度和经度

