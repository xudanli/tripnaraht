# NestJS Watch 模式修复 - 完成

## ✅ 修复完成

### 问题
```
Error: Cannot find module '/home/devbox/project/dist/main'
```

### 解决方案

**核心修复**：修改 `nest-cli.json` 中的 `entryFile` 配置

```json
{
  "sourceRoot": "src",
  "entryFile": "src/main"  // ✅ 与实际输出路径匹配
}
```

### 配置状态

#### ✅ nest-cli.json
- `entryFile: "src/main"` - 匹配 TypeScript 输出路径 `dist/src/main.js`
- `sourceRoot: "src"` - 源文件根目录

#### ✅ package.json
- `build`: `nest build && bash scripts/post-build.sh` - 构建后自动创建符号链接（备用）
- `backend:build`: `nest build && bash scripts/post-build.sh` - 同上
- `dev`: `nest start --watch` - 开发模式
- `backend:dev`: `nest start --watch` - 后端开发模式

#### ✅ scripts/post-build.sh
- 构建后自动创建符号链接 `dist/main.js -> src/main.js`（备用方案）

### 工作原理

1. **TypeScript 编译**：`src/main.ts` → `dist/src/main.js`（保持目录结构）
2. **NestJS 查找**：根据 `entryFile: "src/main"`，查找 `dist/src/main.js` ✅
3. **路径匹配**：配置与实际输出路径一致，问题解决

### 使用方法

**开发模式**（推荐）：
```bash
npm run backend:dev
```

**构建模式**：
```bash
npm run build
# 或
npm run backend:build
```

### 验证

运行以下命令验证修复：

```bash
# 1. 清理并重新构建
rm -rf dist
npm run build

# 2. 检查输出文件
ls -la dist/src/main.js
# 应该看到文件存在

# 3. 启动开发服务器（应该不再报错）
npm run backend:dev
```

### 故障排除

如果仍然遇到问题：

1. **检查配置**：
   ```bash
   cat nest-cli.json | grep entryFile
   ```
   应该显示：`"entryFile": "src/main"`

2. **手动创建符号链接**（如果配置有问题）：
   ```bash
   bash scripts/post-build.sh
   ```

3. **检查文件是否存在**：
   ```bash
   ls -la dist/src/main.js
   ```

### 总结

✅ **主要修复**：`entryFile: "src/main"` 匹配实际输出路径
✅ **备用方案**：构建后脚本自动创建符号链接
✅ **配置已更新**：所有相关文件都已正确配置

现在可以正常使用 `npm run backend:dev` 启动开发服务器了！
