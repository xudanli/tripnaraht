# 路线难度评估 - Swagger接口位置

## 📚 Swagger文档地址

**开发环境**: `http://localhost:3000/api`

启动后端服务后，在浏览器中访问上述地址即可查看完整的API文档。

## 📍 接口位置

### 在Swagger界面中的位置

1. **标签**: `places` (地点查询相关接口)
2. **HTTP方法**: `POST`
3. **路径**: `/places/metrics/difficulty`
4. **接口名称**: `计算路线难度`

### 查找步骤

1. 打开浏览器访问: `http://localhost:3000/api`
2. 在页面左侧找到 **`places`** 标签（地点查询相关接口）
3. 展开 `places` 标签
4. 向下滚动找到 **`POST /places/metrics/difficulty`**
5. 点击展开查看完整的接口文档

## 📋 接口详细信息

### 接口描述

计算两点间路线的难度等级，包括距离、爬升、坡度等指标。

**功能流程**：
1. 从 Google Maps 或 Mapbox 获取路线
2. 对路线进行等距重采样
3. 获取高程数据（Google Elevation API 或 Mapbox Terrain-RGB）
4. 计算距离、累计爬升、平均坡度
5. 评估难度等级（EASY/MODERATE/HARD/EXTREME）
6. 可选返回 GeoJSON 格式的路线数据

### 请求参数

在Swagger中可以看到详细的请求参数说明：

#### 必需参数
- `provider`: 数据源（`google` 或 `mapbox`）
- `origin`: 起点坐标（格式：`lat,lon` 或 `lon,lat`）
- `destination`: 终点坐标

#### 可选参数
- `profile`: 路线模式（默认：`walking`）
- `sampleM`: 采样间隔（米，默认：30）
- `category`: 类别（如 `ATTRACTION`）
- `accessType`: 访问方式（如 `HIKING`）
- `visitDuration`: 访问时长（如 `"半天"`）
- `elevationMeters`: 海拔（米）
- `trailDifficulty`: 官方难度评级
- `includeGeoJson`: 是否返回GeoJSON（默认：false）

### 请求示例

Swagger中提供了两个示例：

#### Google示例
```json
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

#### Mapbox示例
```json
{
  "provider": "mapbox",
  "origin": "7.9904,46.5763",
  "destination": "7.985,46.577",
  "profile": "walking",
  "sampleM": 30,
  "category": "ATTRACTION",
  "visitDuration": "半天",
  "z": 14,
  "workers": 8
}
```

### 响应格式

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

### 响应状态码

- `200`: 成功返回路线难度评估结果
- `400`: 请求参数无效
- `503`: 服务不可用（API密钥未配置或外部API错误）

## 🧪 在Swagger中测试

Swagger界面支持直接测试接口：

1. 展开接口详情
2. 点击 **"Try it out"** 按钮
3. 填写请求参数（或使用示例数据）
4. 点击 **"Execute"** 执行请求
5. 查看响应结果

## 🔗 相关接口

在 `places` 标签下，你还可以找到其他相关接口：

- `GET /places/nearby` - 查找附近的地点
- `POST /places/nature-poi/map-to-activity` - 将自然POI映射为活动
- `GET /places/nature-poi/nearby` - 查找附近的自然POI
- 等等...

## 📝 注意事项

1. **API密钥配置**: 确保 `.env` 文件中配置了相应的API密钥
   - Google: `GOOGLE_MAPS_API_KEY` 或 `GOOGLE_ROUTES_API_KEY`
   - Mapbox: `MAPBOX_ACCESS_TOKEN` 或 `VITE_MAPBOX_ACCESS_TOKEN`

2. **Python依赖**: 后端服务需要Python依赖才能正常工作
   - `requests`
   - `pillow`

3. **坐标格式**: 
   - Google使用 `lat,lon` 格式
   - Mapbox使用 `lon,lat` 格式

4. **超时设置**: Python脚本默认60秒超时，长路线可能需要调整

## 🚀 快速测试

启动后端服务：
```bash
npm run backend:dev
```

然后在浏览器中打开：
```
http://localhost:3000/api
```

找到 `POST /places/metrics/difficulty` 接口，使用Swagger的"Try it out"功能进行测试！

