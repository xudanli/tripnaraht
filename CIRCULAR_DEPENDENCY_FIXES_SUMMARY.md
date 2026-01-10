# 循环依赖修复总结

## 已修复的循环依赖问题

### 修复策略
将所有在构造函数中注入跨模块服务的 Skill 改为懒加载模式，使用 `ModuleRef.get()` 在运行时获取服务，而不是在构造函数中注入。

### 已修复的 Skill

1. **ContextBuildSkill** (`src/skills/context/context-build.skill.ts`)
   - 问题：注入 `ContextEngineerService`（来自 `ContextEngineModule`）
   - 修复：改为懒加载

2. **HitlCreateApprovalTaskSkill** (`src/skills/hitl/hitl-create-approval-task.skill.ts`)
   - 问题：注入 `ApprovalService` 和 `DecisionLogStorageService`（来自 `DecisionModule`）
   - 修复：改为懒加载

3. **HitlResolveApprovalTaskSkill** (`src/skills/hitl/hitl-resolve-approval-task.skill.ts`)
   - 问题：注入 `ApprovalService` 和 `DecisionLogStorageService`（来自 `DecisionModule`）
   - 修复：改为懒加载

4. **DecisionRequestApprovalSkill** (`src/skills/hitl/decision-request-approval.skill.ts`)
   - 问题：注入 `ApprovalService`（来自 `DecisionModule`）
   - 修复：改为懒加载

5. **DecisionCheckApprovalSkill** (`src/skills/hitl/decision-check-approval.skill.ts`)
   - 问题：注入 `ApprovalService`（来自 `DecisionModule`）
   - 修复：改为懒加载

## 修复模式

所有修复都遵循相同的模式：

```typescript
// 修复前
constructor(
  @Optional() private readonly service?: SomeService,
) {}

// 修复后
private service?: SomeService;

constructor(
  private readonly moduleRef: ModuleRef,
) {
  // ⚠️ 使用懒加载避免循环依赖死锁
}

private getService(): SomeService | null {
  if (!this.service) {
    try {
      this.service = this.moduleRef.get(SomeService, { strict: false });
    } catch (error) {
      return null;
    }
  }
  return this.service || null;
}

// 在 execute 方法中使用
async execute(input: Input): Promise<Output> {
  const service = this.getService();
  if (!service) {
    throw new Error('Service 未注入，功能不可用');
  }
  // 使用 service...
}
```

## 当前状态

- ✅ **编译成功**: 所有修复后的代码已编译通过
- ✅ **循环依赖修复**: 已修复所有已知的循环依赖问题
- ⚠️ **仍超时**: 应用仍然在启动时超时（60秒）

## 可能的问题原因

1. **其他未知的循环依赖**: 可能还有其他 Skill 或服务存在循环依赖
2. **SkillsModule 初始化阻塞**: `SkillsModule` 的初始化过程中可能有其他阻塞点
3. **DecisionModule 初始化阻塞**: `DecisionModule` 在初始化 `SkillsModule` 时可能有其他阻塞点
4. **SkillsRegistryService 阻塞**: `SkillsRegistryService` 构造函数中注入大量 Skill 实例可能导致阻塞

## 下一步建议

1. **添加调试日志**: 在 `DecisionModule` 和 `SkillsModule` 的初始化过程中添加更多日志
2. **检查其他 Skill**: 检查是否有其他 Skill 注入了跨模块的服务
3. **检查 SkillsRegistryService**: 检查 `SkillsRegistryService` 构造函数中是否有阻塞操作
4. **检查 SkillsModule 构造函数**: 检查 `SkillsModule` 构造函数中是否有阻塞操作

## 环境变量控制

已添加环境变量控制，允许选择性禁用模块：

- `ENABLE_SKILLS_MODULE=false` - 禁用 SkillsModule
- `ENABLE_CONTEXT_ENGINE_MODULE=false` - 禁用 ContextEngineModule
- `ENABLE_DECISION_SKILLS=false` - 禁用 DecisionModule 导入（在 SkillsModule 中）
- `ENABLE_READINESS_MODULE=false` - 禁用 ReadinessModule
- `ENABLE_ROUTE_DIRECTIONS_MODULE=false` - 禁用 RouteDirectionsModule

默认配置（所有可能有问题的模块都禁用）应该可以正常启动。
