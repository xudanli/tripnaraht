# File Extractor Direct Service 设置指南

## 🔧 问题诊断

如果遇到 404 错误，可能是以下原因：

### 1. 服务器未重启

**症状**: 所有端点返回 404

**解决方法**:
```bash
# 如果使用 watch 模式，等待自动重新编译（通常需要 10-30 秒）
# 或者手动重启服务器：
# 1. 按 Ctrl+C 停止服务器
# 2. 重新运行: npm run dev
```

### 2. 模块未正确导入

**检查方法**:
```bash
# 确认模块已导入
grep -r "FileExtractorDirectModule" src/app.module.ts
```

**应该看到**:
```typescript
import { FileExtractorDirectModule } from './mcp/file-extractor-direct.module';
// ...
FileExtractorDirectModule, // File Extractor Direct 模块（直接实现，无需认证）⭐
```

### 3. 编译错误

**检查方法**:
查看服务器启动日志，查找错误信息。

**常见错误**:
- 缺少依赖包：运行 `npm install`
- TypeScript 类型错误：检查 `src/mcp/file-extractor-direct.service.ts`

---

## ✅ 验证步骤

### 步骤 1: 检查服务器日志

启动服务器后，应该看到类似日志：
```
[Nest] File Extractor Direct Service initialized
```

### 步骤 2: 测试健康检查

```bash
curl http://localhost:3000/api/file-extractor-direct/health
```

**期望响应**:
```json
{
  "success": true,
  "data": {
    "available": true,
    "service": "file-extractor-direct",
    "features": ["PDF", "DOCX", "XLSX", "CSV"],
    "authentication": "none"
  }
}
```

### 步骤 3: 运行完整测试

```bash
npm run mcp:test:file-extractor:direct
```

---

## 🚀 快速修复

如果遇到 404 错误，按以下步骤操作：

1. **停止服务器** (Ctrl+C)

2. **确认文件存在**:
   ```bash
   ls -la src/mcp/file-extractor-direct.*
   ```

3. **重新启动服务器**:
   ```bash
   npm run dev
   ```

4. **等待编译完成**（查看日志中的 "Application is running on" 消息）

5. **测试健康检查**:
   ```bash
   curl http://localhost:3000/api/file-extractor-direct/health
   ```

---

## 📝 文件清单

确保以下文件存在：

- ✅ `src/mcp/file-extractor-direct.service.ts`
- ✅ `src/mcp/file-extractor-direct.controller.ts`
- ✅ `src/mcp/file-extractor-direct.module.ts`
- ✅ `src/mcp/dto/file-extractor.dto.ts`
- ✅ `src/app.module.ts` (包含 FileExtractorDirectModule 导入)

---

## 🔍 调试技巧

### 查看所有注册的路由

如果服务器支持，可以访问 Swagger 文档：
```
http://localhost:3000/api-docs
```

查找 `file-extractor-direct` 标签下的端点。

### 检查模块加载顺序

如果模块之间有依赖关系，确保依赖的模块先加载。

---

**最后更新**: 2026-02-07
