# 冰岛官方数据源获取指南

本指南详细说明如何从冰岛官方数据源获取地理数据，并导入到系统中。

## 一、冰岛土地测量局 (Landmælingar Íslands)

### 1. 访问入口

- **官方网站**: https://www.lmi.is/
- **地理信息门户 (Landupplýsingagátt)**: https://www.lmi.is/is/landupplysingagatt
- **北极 SDI**: https://arctic-sdi.org/

### 2. 可获取的数据类型

#### 基础地理数据
- **DEM (数字高程模型)**: ÍslandsDEM，2m-10m 分辨率
- **行政区划**: 国家、地区、城市边界
- **道路网**: 主要道路、次要道路、小径
- **地名点**: 城市、村庄、地标名称
- **水系**: 河流、湖泊、海岸线
- **建筑物**: 建筑物轮廓和位置

#### 使用方法

1. **访问地理信息门户**
   ```
   https://www.lmi.is/is/landupplysingagatt
   ```

2. **搜索数据**
   - 在搜索框输入关键字：`DEM`, `Administrative boundaries`, `Place names`
   - 或浏览数据目录

3. **下载数据**
   - 选择所需数据集
   - 选择格式：GeoJSON, Shapefile, GeoPackage
   - 下载到本地

4. **数据处理**
   - 使用 QGIS 打开数据
   - 统一坐标系为 WGS84 (EPSG:4326)
   - 导出为 GeoJSON

### 3. 数据格式示例

下载的数据通常是 Shapefile 或 GeoPackage 格式，需要转换为 GeoJSON：

```bash
# 使用 ogr2ogr (GDAL) 转换
ogr2ogr -f GeoJSON output.geojson input.shp -t_srs EPSG:4326
```

## 二、冰岛自然历史研究所 (Náttúrufræðistofnun Íslands)

### 1. 访问入口

- **官方网站**: https://www.ni.is/
- **地理空间数据**: https://www.ni.is/is/geospatial-data
- **开放数据**: https://www.ni.is/is/open-data

### 2. 可获取的数据类型

#### 火山活动数据
- **火山系统**: 火山位置、类型、状态
- **火山口**: 火山口位置和特征
- **喷发历史**: 历史喷发记录
- **火山带**: 火山带分布

#### 地质数据
- **地质图**: 岩性、断裂带、熔岩流
- **火山带**: 火山活动区域
- **地热区**: 地热活动区域

#### 生态环境数据
- **土地覆盖**: 植被类型、土地用途
- **栖息地**: 野生动物栖息地
- **保护区**: 国家公园、自然保护区边界

### 3. 获取步骤

#### 步骤 1: 访问数据下载页面

1. 访问 https://www.ni.is/
2. 导航到 `Resources` → `Geospatial data` 或 `Open data`
3. 浏览可用数据集

#### 步骤 2: 下载数据

1. 选择所需数据集（如 "Volcanic activity"）
2. 下载 Shapefile 或 GeoPackage 格式
3. 注意数据说明和字段定义

#### 步骤 3: 在 QGIS 中处理

1. **打开数据**
   ```qgis
   文件 → 打开数据源 → 选择下载的文件
   ```

2. **检查坐标系**
   - 查看图层属性 → 源信息
   - 如果不是 WGS84，需要重新投影

3. **重新投影（如需要）**
   ```qgis
   处理 → 工具箱 → 搜索 "重新投影"
   输入图层: 你的图层
   目标坐标系: EPSG:4326 (WGS84)
   ```

4. **处理多边形数据**
   - 如果数据是多边形（Polygon），需要生成中心点：
   ```qgis
   矢量 → 几何工具 → 多边形质心
   输入图层: 你的多边形图层
   输出: 点图层
   ```

5. **字段映射和重命名**
   - 查看属性表，了解字段含义
   - 重命名字段以匹配系统要求：
     - `VOLC_NAME` → `name`
     - `VOLC_TYPE` → `subCategory`
     - `LAST_ERUPT` → `lastEruptionYear`
     - `STATUS` → `isActiveVolcano` (active = true)

6. **导出为 GeoJSON**
   ```qgis
   右键图层 → 导出 → 保存要素为
   格式: GeoJSON
   文件名: iceland-volcanoes.geojson
   坐标系: EPSG:4326
   ```

### 4. 字段映射参考

#### 火山数据字段映射

| 原始字段 | 系统字段 | 说明 |
|---------|---------|------|
| VOLC_NAME | name | 火山名称 |
| VOLC_TYPE | subCategory | 类型（映射为 'volcano'） |
| LAST_ERUPT | lastEruptionYear | 最后喷发年份 |
| STATUS | isActiveVolcano | 状态（active = true） |
| ELEVATION | elevationMeters | 海拔（米） |
| HAZARD_CLASS | hazardLevel | 危险等级 |

#### 地质数据字段映射

| 原始字段 | 系统字段 | 说明 |
|---------|---------|------|
| GEOL_TYPE | subCategory | 地质类型（映射为对应类别） |
| NAME | name | 名称 |
| ELEVATION | elevationMeters | 海拔 |

## 三、数据处理工作流

### 完整工作流示例：导入火山数据

#### 1. 下载数据

```bash
# 从 NSI 下载火山数据
# 保存为: iceland-volcanoes.shp
```

#### 2. 在 QGIS 中处理

1. 打开 `iceland-volcanoes.shp`
2. 检查坐标系（如果不是 WGS84，重新投影）
3. 如果是多边形，生成质心点
4. 查看属性表，了解字段
5. 导出为 GeoJSON

#### 3. 准备 GeoJSON

确保 GeoJSON 包含以下字段：

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-19.6133, 63.63]
      },
      "properties": {
        "name": "Eyjafjallajökull",
        "name_en": "Eyjafjallajökull",
        "subCategory": "volcano",
        "elevation": 1666,
        "lastEruptionYear": 2010,
        "isActiveVolcano": true,
        "hazardLevel": "high",
        "accessType": "4x4",
        "trailDifficulty": "hard",
        "requiresGuide": true
      }
    }
  ]
}
```

#### 4. 导入到系统

```bash
npm run import:nature-poi -- \
  --file ./data/iceland-volcanoes.geojson \
  --source iceland_nsi \
  --country IS
```

## 四、常见问题

### Q1: 数据坐标系不是 WGS84 怎么办？

**A**: 在 QGIS 中重新投影：
1. 右键图层 → 属性 → 源信息，查看当前坐标系
2. 处理 → 工具箱 → 重新投影
3. 目标坐标系选择 EPSG:4326 (WGS84)

### Q2: 数据是多边形，如何转换为点？

**A**: 使用 QGIS 的质心工具：
1. 矢量 → 几何工具 → 多边形质心
2. 输入多边形图层
3. 输出点图层

### Q3: 字段名称不匹配怎么办？

**A**: 在 QGIS 中重命名字段：
1. 打开属性表
2. 字段计算器创建新字段
3. 或导出后手动编辑 GeoJSON

### Q4: 如何批量处理多个数据集？

**A**: 使用 QGIS 的批处理功能：
1. 处理 → 工具箱
2. 右键工具 → 作为批处理执行
3. 选择多个输入文件

## 五、数据质量检查

导入前建议检查：

1. **坐标范围**: 确保在冰岛范围内（约 63-67°N, 13-25°W）
2. **必需字段**: 至少包含名称和坐标
3. **字段类型**: 确保数字字段是数字，不是字符串
4. **重复数据**: 检查是否有重复的 POI

### 使用验证工具

系统提供了 GeoJSON 验证功能：

```typescript
import { validateGeoJSON } from './utils/geojson-validator.util';

const result = validateGeoJSON(geojson);
if (!result.valid) {
  console.error('验证失败:', result.errors);
}
```

## 六、数据更新和维护

### 定期更新

建议每季度或半年更新一次数据：
- 火山活动数据可能变化
- 新的保护区可能建立
- 道路和设施可能更新

### 数据版本管理

建议为每次导入的数据创建版本：
- 文件名包含日期：`iceland-volcanoes-2024-01.geojson`
- 在 metadata 中记录数据源和日期

## 七、资源链接

- [Landmælingar Íslands](https://www.lmi.is/)
- [Náttúrufræðistofnun Íslands](https://www.ni.is/)
- [QGIS 下载](https://qgis.org/)
- [GDAL/OGR 工具](https://gdal.org/)

## 八、技术支持

如遇到问题：
1. 检查数据格式和坐标系
2. 查看系统日志
3. 使用验证工具检查 GeoJSON
4. 参考示例文件：`data/examples/iceland-volcano-example.geojson`
