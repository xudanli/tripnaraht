# 路线难度评估 - API密钥配置修复

## 问题描述

API返回503错误：`GOOGLE_MAPS_API_KEY 未配置`

## 原因分析

`.env`文件中配置的是 `GOOGLE_ROUTES_API_KEY`，但服务代码只检查 `GOOGLE_MAPS_API_KEY`。

## 解决方案

已更新服务代码，现在支持多种环境变量名：

### Google API密钥（按优先级）
1. `GOOGLE_MAPS_API_KEY`
2. `GOOGLE_ROUTES_API_KEY` ✅ (你的.env中有这个)
3. `GOOGLE_PLACES_API_KEY`

### Mapbox Token（按优先级）
1. `MAPBOX_ACCESS_TOKEN`
2. `VITE_MAPBOX_ACCESS_TOKEN` ✅ (你的.env中有这个)

## 当前.env配置

你的`.env`文件中已配置：
- ✅ `GOOGLE_ROUTES_API_KEY`
- ✅ `GOOGLE_PLACES_API_KEY`
- ✅ `VITE_MAPBOX_ACCESS_TOKEN`

这些都会被正确识别！

## 测试

重新编译并重启服务：

```bash
npm run backend:build
npm run backend:dev
```

然后在Swagger中再次测试接口，应该可以正常工作了。

## 如果还有问题

1. **确认.env文件位置**: 确保`.env`文件在项目根目录
2. **重启服务**: 环境变量只在服务启动时加载
3. **检查ConfigModule**: 确认`ConfigModule.forRoot()`已配置（已在`app.module.ts`中配置）

