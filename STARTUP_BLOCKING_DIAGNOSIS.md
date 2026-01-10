# 启动阻塞问题诊断与修复

## 问题总结

应用在启动时超时（60秒），无法正常启动。

## 诊断过程

通过二进制搜索法逐步禁用模块，最终定位到问题模块：

1. **`ContextEngineModule`** - 导致启动阻塞（已确认）
2. **`SkillsModule`** - 导致启动阻塞（已确认）

## 根本原因

### 循环依赖死锁

**问题链路**：
```
ContextEngineModule 
  → imports: forwardRef(() => SkillsModule)
  → providers: ContextEngineerService

SkillsModule
  → imports: forwardRef(() => ContextEngineModule) (当 enableContextEngineModule === true)
  → providers: ContextBuildSkill
  
ContextBuildSkill
  → constructor: @Inject(ContextEngineerService) ❌
```

**死锁场景**：
1. `ContextEngineModule` 初始化时尝试解析 `SkillsModule`
2. `SkillsModule` 初始化时创建 `SkillsRegistryService`
3. `SkillsRegistryService` 构造函数注入所有 Skill 实例，包括 `ContextBuildSkill`
4. `ContextBuildSkill` 构造函数需要注入 `ContextEngineerService`（来自 `ContextEngineModule`）
5. 但此时 `ContextEngineModule` 还没有完全初始化完成 → **死锁**

## 修复方案

### 1. 修复 `ContextBuildSkill` 的循环依赖

**文件**：`src/skills/context/context-build.skill.ts`

**修改**：将构造函数注入改为懒加载

**修改前**：
```typescript
constructor(
  @Optional() private readonly contextEngineer?: ContextEngineerService,
) {
  if (!this.contextEngineer) {
    this.logger.warn('ContextEngineerService 未注入，context.build 功能将不可用');
  }
}
```

**修改后**：
```typescript
private contextEngineer?: ContextEngineerService;

constructor(
  private readonly moduleRef: ModuleRef,
) {
  // ⚠️ 使用懒加载避免循环依赖死锁
  // ContextEngineerService 在 execute 方法中通过 ModuleRef 获取
}

private getContextEngineer(): ContextEngineerService | null {
  if (!this.contextEngineer) {
    try {
      this.contextEngineer = this.moduleRef.get(ContextEngineerService, { strict: false });
    } catch (error) {
      this.logger.warn('无法获取 ContextEngineerService，context.build 功能将不可用');
      return null;
    }
  }
  return this.contextEngineer || null;
}
```

### 2. 添加环境变量控制

**文件**：`src/trips/decision/decision.module.ts`

添加环境变量控制，允许选择性禁用模块：
- `ENABLE_CONTEXT_ENGINE_MODULE=true` - 启用 ContextEngineModule（默认禁用）
- `ENABLE_SKILLS_MODULE=true` - 启用 SkillsModule（默认禁用）
- `ENABLE_READINESS_MODULE=false` - 禁用 ReadinessModule
- `ENABLE_ROUTE_DIRECTIONS_MODULE=false` - 禁用 RouteDirectionsModule

**文件**：`src/skills/skills.module.ts`

添加环境变量控制：
- `ENABLE_DECISION_SKILLS=true` - 启用 DecisionModule 导入（默认禁用，避免循环依赖）
- `ENABLE_CONTEXT_ENGINE_MODULE=true` - 启用 ContextEngineModule 导入（默认禁用）

## 当前状态

- ✅ **修复完成**：`ContextBuildSkill` 的循环依赖已修复
- ✅ **环境变量控制**：已添加环境变量控制，默认禁用可能导致问题的模块
- ⚠️ **测试中**：需要验证修复是否完全解决问题

## 测试建议

### 测试 1：禁用两个模块（当前状态）
```bash
# 默认禁用 ContextEngineModule 和 SkillsModule
npm run dev
# 预期：应用成功启动
```

### 测试 2：仅启用 SkillsModule
```bash
ENABLE_SKILLS_MODULE=true npm run dev
# 预期：应用成功启动（已修复循环依赖）
```

### 测试 3：启用 ContextEngineModule 和 SkillsModule
```bash
ENABLE_CONTEXT_ENGINE_MODULE=true ENABLE_SKILLS_MODULE=true npm run dev
# 预期：应用成功启动（已修复循环依赖）
```

## 相关文件

- `src/skills/context/context-build.skill.ts` - 已修复循环依赖
- `src/trips/decision/decision.module.ts` - 添加环境变量控制
- `src/skills/skills.module.ts` - 添加环境变量控制

## 注意事项

1. **懒加载**：`ContextBuildSkill` 现在使用 `ModuleRef` 进行懒加载，在运行时获取 `ContextEngineerService`，而不是在构造函数中注入
2. **可选依赖**：即使 `ContextEngineModule` 未启用，`ContextBuildSkill` 也不会报错，只是相关功能不可用
3. **环境变量**：确保环境变量配置正确，避免意外的模块加载顺序问题

## 后续工作

1. ✅ 修复 `ContextBuildSkill` 的循环依赖
2. ⚠️ 验证修复是否完全解决问题
3. ⚠️ 测试所有功能是否正常工作
4. ⚠️ 如果问题仍然存在，需要进一步排查其他可能的阻塞点
