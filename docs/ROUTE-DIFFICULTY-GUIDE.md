# 路线难度评估指南

## 📋 概述

本文档说明如何使用"路线→高程→难度"链路来计算两点间路线的难度等级。

### 功能流程

1. **路线获取**：从 Google Maps 或 Mapbox 获取两点间的路线
2. **重采样**：对路线进行等距重采样（默认30米间隔）
3. **高程采样**：获取每个采样点的高程数据
   - Google：使用 Elevation API
   - Mapbox：使用 Terrain-RGB 瓦片（带双线性插值）
4. **指标计算**：计算距离、累计爬升、平均坡度
5. **难度评估**：基于数学模型评估难度等级（EASY/MODERATE/HARD/EXTREME）

## 🔧 环境准备

### 1. Python 依赖

```bash
pip install requests pillow
```

### 2. API 密钥配置

#### Google Maps API
需要以下 API：
- Directions API
- Elevation API

设置环境变量：
```bash
export GOOGLE_MAPS_API_KEY=your_api_key_here
```

#### Mapbox API
需要以下 API：
- Directions API
- Terrain-RGB 瓦片

设置环境变量：
```bash
export MAPBOX_ACCESS_TOKEN=your_access_token_here
```

## 🚀 使用方法

### 方法1：命令行工具（Python脚本）

#### Google 示例

```bash
python tools/end2end_difficulty_with_geojson.py \
  --provider google \
  --origin "39.9042,116.4074" \
  --destination "39.914,116.403" \
  --profile walking \
  --sample-m 30 \
  --category ATTRACTION \
  --accessType HIKING \
  --elevationMeters 2300 \
  --out test_google.geojson
```

#### Mapbox 示例

```bash
python tools/end2end_difficulty_with_geojson.py \
  --provider mapbox \
  --origin "7.9904,46.5763" \
  --destination "7.985,46.577" \
  --profile walking \
  --sample-m 30 \
  --category ATTRACTION \
  --visitDuration "半天" \
  --z 14 \
  --workers 8 \
  --out test_mapbox.geojson
```

### 方法2：API 端点

#### 请求

```bash
POST /places/metrics/difficulty
Content-Type: application/json

{
  "provider": "google",
  "origin": "39.9042,116.4074",
  "destination": "39.914,116.403",
  "profile": "walking",
  "sampleM": 30,
  "category": "ATTRACTION",
  "accessType": "HIKING",
  "elevationMeters": 2300,
  "includeGeoJson": false
}
```

#### 响应

```json
{
  "distance_km": 10.8,
  "elevation_gain_m": 720,
  "slope_avg": 0.067,
  "label": "HARD",
  "S_km": 18.0,
  "notes": [
    "altitude: ×1.3",
    "slope: bump one level (≥15%)"
  ],
  "geojson": { ... }  // 可选，如果includeGeoJson=true
}
```

## 📊 难度评估规则

### 优先级顺序

1. **优先级1：trailDifficulty（官方评级）**
   - 如果提供了 `trailDifficulty`，直接使用，不再计算
   - 值：EASY, MODERATE, HARD, EXTREME

2. **优先级2：基于距离和爬升计算**
   - 等效强度距离：`S_km = D + (E_gain / 100)`
     - D：几何距离（公里）
     - E_gain：累计爬升（米）
     - 每100米爬升 ≈ 1公里平路难度

3. **修正因子**
   - **高海拔修正**：如果海拔 ≥ 2000m，`S_km × 1.3`
   - **陡坡修正**：如果平均坡度 ≥ 15%，难度等级上调一档
   - **accessType修正**：VEHICLE/CABLE_CAR → 至少 EASY
   - **subCategory修正**：glacier/volcano → 至少 MODERATE

### 难度等级映射

| 等效强度距离 | 难度等级 | 描述 |
|------------|---------|------|
| ≤ 8 km | EASY | 低强度：适合所有年龄和体力水平 |
| 8-16 km | MODERATE | 中等强度：需要一定体力 |
| 16-30 km | HARD | 高强度：对体力有较高要求 |
| > 30 km | EXTREME | 极高强度：仅限经验丰富的户外人士 |

## 📝 参数说明

### 必需参数

- `provider`: 数据源（"google" 或 "mapbox"）
- `origin`: 起点坐标
  - Google：格式 `"lat,lon"`（如 `"39.9042,116.4074"`）
  - Mapbox：格式 `"lon,lat"`（如 `"7.9904,46.5763"`）
- `destination`: 终点坐标（格式同origin）

### 可选参数

- `profile`: 路线模式（默认："walking"）
  - Google：walking, driving, bicycling, transit
  - Mapbox：walking, driving, cycling
- `sampleM`: 采样间隔（米，默认：30）
- `category`: 类别（如 "ATTRACTION", "RESTAURANT"）
- `accessType`: 访问方式（如 "HIKING", "VEHICLE", "CABLE_CAR"）
- `visitDuration`: 访问时长（如 "半天", "2小时", "1天"）
- `typicalStay`: 典型停留时间
- `elevationMeters`: 海拔（米）
- `subCategory`: 子类别（如 "glacier", "volcano"）
- `trailDifficulty`: 官方难度评级（EASY/MODERATE/HARD/EXTREME）
- `z`: Mapbox缩放级别（默认：14，长路线可用13提速）
- `workers`: Mapbox并发下载线程数（默认：8）
- `includeGeoJson`: 是否返回GeoJSON（默认：false）

## 🔄 缓存机制

API端点会自动缓存结果：
- **缓存键**：基于 provider, origin, destination, profile, sampleM, category, accessType, elevationMeters, trailDifficulty
- **缓存时间**：1小时（3600秒）
- **缓存位置**：内存（Map结构）

相同参数的请求在1小时内会直接返回缓存结果，无需重新计算。

## ⚠️ 注意事项

1. **坐标格式**：注意 Google 使用 `lat,lon`，Mapbox 使用 `lon,lat`
2. **API配额**：注意 Google Maps 和 Mapbox 的 API 配额限制
3. **超时设置**：Python脚本默认60秒超时，长路线可能需要调整
4. **Mapbox并发**：默认8个并发线程，可根据服务器性能调整
5. **精度平衡**：采样间隔越小精度越高，但API调用次数也越多

## 🧪 测试示例

### 测试1：城市短途（北京）

```bash
python tools/end2end_difficulty_with_geojson.py \
  --provider google \
  --origin "39.9042,116.4074" \
  --destination "39.914,116.403" \
  --profile walking \
  --category ATTRACTION
```

### 测试2：山区上坡（瑞士）

```bash
python tools/end2end_difficulty_with_geojson.py \
  --provider mapbox \
  --origin "7.9904,46.5763" \
  --destination "7.985,46.577" \
  --profile walking \
  --category ATTRACTION \
  --accessType HIKING \
  --elevationMeters 2300
```

### 测试3：高海拔路线

```bash
python tools/end2end_difficulty_with_geojson.py \
  --provider mapbox \
  --origin "86.9250,27.9881" \
  --destination "86.9230,27.9890" \
  --profile walking \
  --category ATTRACTION \
  --elevationMeters 5500 \
  --subCategory glacier
```

## 🔍 故障排除

### 问题1：Python脚本找不到

确保脚本路径正确：`tools/end2end_difficulty_with_geojson.py`

### 问题2：API密钥未配置

检查环境变量：
```bash
echo $GOOGLE_MAPS_API_KEY
echo $MAPBOX_ACCESS_TOKEN
```

### 问题3：PIL/Pillow未安装

```bash
pip install pillow
```

### 问题4：Mapbox Terrain-RGB下载失败

- 检查网络连接
- 检查API令牌权限
- 尝试降低并发数（--workers 4）

### 问题5：JSON解析失败

检查Python脚本输出，确保最后一行是有效的JSON格式。

## 📚 相关文档

- [GPX疲劳计算指南](./GPX-FATIGUE-CALCULATION.md)
- [难度评估所需字段说明](./Difficulty%20评估所需字段说明.md)
- [难度与疲劳架构](./DIFFICULTY-VS-FATIGUE-ARCHITECTURE.md)

