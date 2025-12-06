
# TypeScript 装饰器配置修复指南

## 问题描述

遇到以下 TypeScript 错误：
- `TS1240`: Unable to resolve signature of property decorator
- `TS1241`: Unable to resolve signature of method decorator
- `Decorators are not valid here`

## 原因

项目同时使用 Next.js 和 NestJS，但根目录的 `tsconfig.json` 缺少装饰器支持配置。

## 解决方案

### 1. 更新根目录 `tsconfig.json`

在 `compilerOptions` 中添加装饰器支持：

```json
{
  "compilerOptions": {
    // ... 其他配置 ...
    
    // 👇 NestJS 装饰器支持（必须开启）
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    
    // ... 其他配置 ...
  }
}
```

### 2. 更新 `tsconfig.backend.json`

修复配置冲突，确保 NestJS 使用正确的模块系统：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "commonjs",
    "moduleResolution": "node",  // 覆盖 bundler
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    // ... 其他配置
  }
}
```

### 3. 配置 `nest-cli.json`

指定使用后端专用的 tsconfig：

```json
{
  "compilerOptions": {
    "tsConfigPath": "tsconfig.backend.json"
  }
}
```

## 配置说明

### `experimentalDecorators`
- **作用**: 允许使用装饰器语法（`@IsString()`, `@Get()`, `@Injectable()` 等）
- **必需**: 是，NestJS 大量使用装饰器

### `emitDecoratorMetadata`
- **作用**: 在运行时保留类型元数据，用于依赖注入和验证管道
- **必需**: 是，NestJS 的依赖注入系统依赖此功能

## 验证修复

运行构建命令验证：

```bash
npm run backend:build
```

如果编译成功且没有装饰器相关错误，说明修复成功。

## 文件结构

```
project/
├── tsconfig.json              # 根配置（Next.js + NestJS 共用）
├── tsconfig.backend.json      # NestJS 专用配置
└── nest-cli.json              # NestJS CLI 配置
```

## 注意事项

1. **Next.js 兼容性**: 添加装饰器支持不会影响 Next.js，因为 Next.js 也支持装饰器（虽然不常用）

2. **模块系统**: 
   - Next.js 使用 `module: "esnext"` 和 `moduleResolution: "bundler"`
   - NestJS 使用 `module: "commonjs"` 和 `moduleResolution: "node"`
   - 通过 `tsconfig.backend.json` 覆盖配置解决冲突

3. **重启服务**: 
   - 如果编辑器仍有错误提示，重启 TypeScript 服务器
   - VS Code: `F1` -> `TypeScript: Restart TS Server`

## 当前状态

✅ 所有装饰器错误已修复
✅ 编译成功
✅ 所有模块正常构建

