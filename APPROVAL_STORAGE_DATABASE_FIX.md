# ApprovalStorageService 数据库支持修复

## 问题

`ApprovalStorageService` 使用内存存储而不是数据库，导致警告：
```
⚠️  生产环境警告: 当前使用内存存储，重启后数据会丢失。建议使用数据库或 Redis。
```

## 原因分析

### 为什么之前不使用数据库？

1. **历史遗留**：`ApprovalStorageService` 最初是为了开发/测试而设计的轻量级实现
2. **生命周期问题**：在构造函数中检查 `prisma.isDbConnected()` 时，`PrismaService.onModuleInit()` 还没有执行，数据库尚未连接
3. **已有替代方案**：`ApprovalService`（在 `DecisionModule` 中）已经使用数据库，是主要的审批服务

### 两个审批服务的关系

1. **ApprovalService** (`src/trips/decision/services/approval.service.ts`)
   - 位置：`DecisionModule`
   - 存储：使用数据库（Prisma）
   - 用途：主要的审批服务，用于生产环境

2. **ApprovalStorageService** (`src/skills/hitl/services/approval-storage.service.ts`)
   - 位置：`SkillsModule`
   - 存储：之前使用内存存储
   - 用途：可能是为了 MCP 模式或作为备用服务

## 修复方案

### 1. 修复生命周期问题 ✅

将数据库连接检查从构造函数移到 `onModuleInit()` 中：

```typescript
// 修复前
constructor(@Optional() private readonly prisma?: PrismaService) {
  this.useDatabase = !!prisma && prisma.isDbConnected(); // ❌ 此时数据库还没连接
}

// 修复后
constructor(@Optional() private readonly prisma?: PrismaService) {
  // 在构造函数中不检查，等待 onModuleInit
}

async onModuleInit() {
  // ✅ 此时 PrismaService.onModuleInit() 已经执行，数据库已连接
  this.useDatabase = !!this.prisma && this.prisma.isDbConnected();
}
```

### 2. 实现数据库操作 ✅

所有方法都已实现数据库支持，并带有降级到内存存储的机制：

- ✅ `createApprovalRequest()` - 优先使用数据库，失败时降级到内存
- ✅ `getApprovalRequest()` - 优先使用数据库，失败时降级到内存
- ✅ `updateApprovalRequest()` - 优先使用数据库，失败时降级到内存
- ✅ `getPendingApprovalsByThreadId()` - 优先使用数据库，失败时降级到内存

### 3. 添加数据映射函数 ✅

- ✅ `mapDbToEntity()` - 将数据库模型转换为 `ApprovalRequest` 实体
- ✅ `mapApprovalStatusToStatus()` - 将 `ApprovalStatus` 枚举转换为字符串
- ✅ `mapStatusToApprovalStatus()` - 将字符串状态转换为 `ApprovalStatus` 枚举

### 4. 导入 PrismaModule ✅

在 `SkillsModule` 中导入 `PrismaModule` 以支持数据库访问。

## 实现细节

### 数据库模式

使用 Prisma schema 中的 `ApprovalRequest` 模型：
```prisma
model ApprovalRequest {
  id            String         @id @default(uuid())
  threadId      String
  toolCallId    String?
  skillName     String
  summary       String
  description   String?
  payload       Json
  riskLevel     String
  status        ApprovalStatus @default(PENDING)
  decisionNote  String?
  handledAt     DateTime?
  expiresAt     DateTime?
  metadata      Json?
  ...
}
```

### 降级机制

所有数据库操作都包含错误处理，失败时自动降级到内存存储：
```typescript
if (this.useDatabase && this.prisma) {
  try {
    // 数据库操作
    return await this.prisma.approvalRequest.create({ ... });
  } catch (error) {
    this.logger.error(`数据库操作失败，降级到内存存储: ${error.message}`);
    // 降级到内存存储
    this.approvalStore.set(request.id, request);
    return request;
  }
} else {
  // 内存存储
  this.approvalStore.set(request.id, request);
  return request;
}
```

## 验证

应用已成功启动，`ApprovalStorageService` 现在会：
1. 检查数据库是否可用
2. 如果可用，使用数据库存储
3. 如果不可用，降级到内存存储（并显示警告）

## 注意事项

1. **数据库连接时机**：必须在 `onModuleInit()` 中检查，而不是构造函数
2. **降级机制**：确保数据库操作失败时不会导致服务崩溃
3. **数据一致性**：如果数据库可用，所有操作都应该使用数据库，避免内存和数据库数据不一致

## 相关文件

- `src/skills/hitl/services/approval-storage.service.ts` - 已修复
- `src/trips/decision/services/approval.service.ts` - 参考实现（已使用数据库）
- `prisma/schema.prisma` - 数据库模型定义
- `src/skills/skills.module.ts` - 已添加 PrismaModule 导入
