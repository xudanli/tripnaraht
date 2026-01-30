# 测试冰岛信息源API接口

## 前置条件

1. **服务必须运行**: 确保开发服务器正在运行
   ```bash
   npm run dev
   ```

2. **服务需要重启**: 如果服务在添加新模块之前就已经运行，需要重启以加载新模块
   ```bash
   # 停止当前服务 (Ctrl+C)
   # 然后重新启动
   npm run dev
   ```

## 测试方法

### 方法1: 使用测试脚本（推荐）

```bash
npx tsx scripts/test-iceland-info-apis.ts
```

### 方法2: 使用curl命令

```bash
# 1. 测试天气预报接口
curl "http://localhost:3000/iceland-info/weather?region=centralhighlands"

# 2. 测试安全信息接口
curl "http://localhost:3000/iceland-info/safety?region=highlands"

# 3. 测试路况信息接口
curl "http://localhost:3000/iceland-info/road-conditions?fRoads=F208,F26,F910"
```

### 方法3: 使用Swagger UI

1. 访问 `http://localhost:3000/api-docs`
2. 找到 `Iceland Info` 标签
3. 展开接口并点击 "Try it out"
4. 填写参数并执行

## 预期响应格式

### 成功响应

```json
{
  "success": true,
  "data": {
    // ... 具体数据
  }
}
```

### 失败响应（404）

如果看到404错误，说明：
1. 服务未运行，或
2. 服务需要重启以加载新模块

```json
{
  "statusCode": 404,
  "message": ["Cannot GET /iceland-info/weather"]
}
```

## 验证步骤

1. ✅ 检查服务是否运行: `curl http://localhost:3000/api-docs`
2. ✅ 检查模块是否加载: 查看启动日志中是否有错误
3. ✅ 测试接口: 运行测试脚本或使用curl
4. ✅ 验证响应: 检查返回的数据格式

## 常见问题

### Q: 接口返回404
**A**: 服务需要重启以加载新模块。停止服务后重新运行 `npm run dev`

### Q: TypeScript编译错误
**A**: 这些错误可能不影响运行时。如果服务能正常启动，可以忽略。或者检查 `tsconfig.json` 配置。

### Q: 返回的是模拟数据
**A**: 这是正常的。由于官方API可能没有公开端点，当前实现会在API不可用时返回模拟数据（标记为 `mock`）。

## 下一步

如果接口测试成功，可以：
1. 集成到路线规划功能中
2. 与POI数据结合使用
3. 实现实际API集成（联系官方获取API访问权限）
