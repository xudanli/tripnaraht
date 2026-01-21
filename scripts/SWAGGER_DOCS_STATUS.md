# Swagger 文档完善状态

## ✅ 已完善的控制器

### 1. decision-stats.controller.ts
- ✅ 所有 9 个接口已添加完整的 Swagger 文档
- ✅ 包括 @ApiOperation、@ApiQuery、@ApiResponse
- ✅ 添加了 @Public() 装饰器

### 2. rag.controller.ts
- ✅ 所有 15 个接口已添加完整的 Swagger 文档
- ✅ 包括 @ApiOperation、@ApiQuery、@ApiBody、@ApiResponse
- ✅ 添加了 @Public() 装饰器

### 3. schedule-action.controller.ts
- ✅ 所有 2 个接口已添加完整的 Swagger 文档
- ✅ 添加了 @Public() 装饰器
- ✅ POST /schedule/apply-action - 应用行程动作
- ✅ POST /schedule/preview-action - 预览行程动作

### 4. decision.controller.ts
- ✅ 所有 3 个接口已添加完整的 Swagger 文档
- ✅ 添加了 @Public() 装饰器
- ✅ POST /decision/validate-safety - 安全规则校验（Abu 策略）
- ✅ POST /decision/adjust-pacing - 行程节奏调整（Dr.Dre 策略）
- ✅ POST /decision/replace-nodes - 路线节点替换（Neptune 策略）

### 5. approval.controller.ts
- ✅ 所有 5 个接口已添加完整的 Swagger 文档
- ✅ 修改标签为 'decision'（统一到 decision 标签下）
- ✅ 修复路径（移除重复的 'api' 前缀）
- ✅ 添加了 @Public() 装饰器
- ✅ GET /approvals/:id - 获取审批请求详情
- ✅ GET /approvals/thread/:threadId/pending - 获取待审批请求
- ✅ POST /approvals/:id/decision - 处理审批请求
- ✅ POST /approvals/:id/cancel - 取消审批请求
- ✅ POST /approvals/:id/resume-agent - 手动触发 Agent 恢复

## 📋 需要检查的其他控制器

根据之前的检查，以下控制器可能还有接口缺少 Swagger 文档：

1. **transport.controller.ts** - 需要检查
2. **其他控制器** - 建议逐个检查

## 🔍 检查方法

使用以下命令检查缺少 Swagger 文档的接口：

```bash
find src -name "*.controller.ts" -type f | while read file; do
  echo "=== $file ==="
  grep -n "@Get\|@Post\|@Put\|@Delete\|@Patch" "$file" | while IFS=: read line_num line_content; do
    start_line=$((line_num - 1))
    end_line=$((line_num + 9))
    if ! sed -n "${start_line},${end_line}p" "$file" 2>/dev/null | grep -q "@ApiOperation"; then
      echo "  ❌ Line $line_num: $line_content"
    fi
  done
done
```

## 📝 Swagger 文档标准

每个接口应该包含：

1. **@ApiOperation** - 接口描述（必需）
   ```typescript
   @ApiOperation({
     summary: '接口摘要',
     description: '详细描述',
   })
   ```

2. **@ApiQuery** - 查询参数（GET 请求）
   ```typescript
   @ApiQuery({ name: 'param', description: '参数描述', required: true })
   ```

3. **@ApiBody** - 请求体（POST/PUT/PATCH 请求）
   ```typescript
   @ApiBody({ type: DtoClass, description: '请求体描述' })
   ```

4. **@ApiParam** - 路径参数
   ```typescript
   @ApiParam({ name: 'id', description: 'ID 描述' })
   ```

5. **@ApiResponse** - 响应描述（推荐）
   ```typescript
   @ApiResponse({ status: 200, description: '成功', type: ResponseDto })
   ```

6. **@Public()** - 如果接口需要公开访问

## 🎯 下一步

1. 继续检查其他控制器
2. 批量添加缺失的 Swagger 文档
3. 确保所有接口都有完整的文档

## 📚 Swagger 地址

- http://localhost:3000/api-docs
- http://0.0.0.0:3000/api-docs
