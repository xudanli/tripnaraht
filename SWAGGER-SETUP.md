# 📚 Swagger/OpenAPI 文档设置

## ✅ 已完成配置

Swagger 已成功集成到项目中，可以自动生成 API 文档。

## 🌐 访问地址

### Swagger UI（交互式文档）
```
http://localhost:3000/api
```

### OpenAPI JSON（原始数据）
```
http://localhost:3000/api-json
```

## 📋 功能特性

### 1. 自动文档生成
- 根据 DTO 和 Controller 自动生成 API 文档
- 支持请求/响应示例
- 支持参数验证说明

### 2. 交互式测试
- 在浏览器中直接测试 API
- 支持所有 HTTP 方法（GET, POST, PUT, DELETE 等）
- 实时查看请求和响应

### 3. 已配置的 API 端点

#### Trips（行程管理）
- `POST /trips` - 创建新行程
- `GET /trips` - 获取所有行程
- `GET /trips/:id` - 获取单个行程详情

#### Places（地点查询）
- `GET /places/nearby` - 查找附近的地点
- `GET /places/nearby/restaurants` - 查找附近的餐厅
- `POST /places` - 创建地点

## 🎨 文档内容

### 每个端点包含：
- **摘要（Summary）**: 简短描述
- **详细描述（Description）**: 功能说明
- **参数说明**: 所有查询参数、路径参数、请求体
- **响应示例**: 成功和失败的响应格式
- **请求示例**: 可以直接使用的示例数据

### DTO 文档
- 所有字段的类型和描述
- 枚举值的说明
- 验证规则
- 示例值

## 🔧 配置说明

### main.ts 中的配置

```typescript
const config = new DocumentBuilder()
  .setTitle('TripNara API')
  .setDescription('智能旅行规划 API')
  .setVersion('1.0')
  .addTag('trips', '行程管理相关接口')
  .addTag('places', '地点查询相关接口')
  .addServer('http://localhost:3000', '开发环境')
  .build();
```

### Controller 装饰器

```typescript
@ApiTags('trips')  // 分组标签
@ApiOperation({ summary: '创建新行程' })  // 操作说明
@ApiResponse({ status: 201, description: '创建成功' })  // 响应说明
```

### DTO 装饰器

```typescript
@ApiProperty({ 
  description: '目的地国家代码',
  example: 'JP',
  enum: ['JP', 'IS', 'US', 'CN']
})
destination!: string;
```

## 🚀 使用示例

### 1. 在浏览器中打开
```
http://localhost:3000/api
```

### 2. 测试创建行程
1. 找到 `POST /trips` 端点
2. 点击 "Try it out"
3. 修改请求体中的示例数据
4. 点击 "Execute"
5. 查看响应结果

### 3. 查看请求示例
每个端点都提供了可以直接使用的示例数据，可以直接复制到你的 API 客户端（如 Postman、curl）中使用。

## 📝 添加新 API 文档

### 步骤 1: 在 Controller 中添加装饰器

```typescript
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('your-tag')
@Controller('your-endpoint')
export class YourController {
  @Get()
  @ApiOperation({ summary: '简短描述', description: '详细描述' })
  @ApiResponse({ status: 200, description: '成功响应' })
  yourMethod() {
    // ...
  }
}
```

### 步骤 2: 在 DTO 中添加装饰器

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class YourDto {
  @ApiProperty({ 
    description: '字段描述',
    example: '示例值',
    type: String
  })
  yourField!: string;
}
```

### 步骤 3: 重启服务器

```bash
npm run backend:dev
```

文档会自动更新！

## 🎯 最佳实践

1. **详细的描述**: 为每个端点和字段提供清晰的描述
2. **示例值**: 提供真实可用的示例数据
3. **响应说明**: 说明所有可能的响应状态码
4. **参数验证**: 在描述中说明验证规则
5. **标签分组**: 使用 `@ApiTags` 将相关端点分组

## 🔍 故障排除

### 问题：Swagger 页面无法访问

**解决**：
1. 确认服务器正在运行：`npm run backend:dev`
2. 检查端口是否正确：默认是 3000
3. 访问：`http://localhost:3000/api`

### 问题：文档不显示某些字段

**解决**：
1. 确保 DTO 中使用了 `@ApiProperty` 装饰器
2. 检查字段是否有 `!` 或 `?` 标记
3. 重启服务器

### 问题：示例数据不正确

**解决**：
1. 检查 `@ApiProperty` 中的 `example` 值
2. 检查 `@ApiResponse` 中的 `schema.example`
3. 确保示例数据符合验证规则

## 📚 相关资源

- [NestJS Swagger 官方文档](https://docs.nestjs.com/openapi/introduction)
- [OpenAPI 规范](https://swagger.io/specification/)
- [Swagger UI](https://swagger.io/tools/swagger-ui/)

