# 系统 Skills 文档

## 概述

本目录包含 **TripNARA 系统运行时使用的 Skills**（系统 Skills），这些 Skills 是系统能力的一部分，在运行时被调用执行具体任务。

**位置**：`prompts/skills/`

## 系统 Skills 列表

### 查询类 Skills

1. **天气预报查询** (`天气预报查询.md`)
   - 查询天气预报信息
   - 用于行程规划中的天气考虑

2. **实时路况查询** (`实时路况查询.md`)
   - 查询实时路况信息
   - 用于交通规划和路线优化

3. **机票价格查询** (`机票价格查询.md`)
   - 查询机票价格信息
   - 用于预算估算和交通规划

4. **活动预定查询** (`活动预定查询.md`)
   - 查询活动预定信息
   - 用于行程规划中的活动安排

5. **租车服务查询** (`租车服务查询.md`)
   - 查询租车服务信息
   - 用于交通规划和租车安排

6. **酒店预定查询** (`酒店预定查询.md`)
   - 查询酒店预定信息
   - 用于住宿规划和预算估算

7. **时间约束与动线优化** (`时间约束与动线优化.md`)
   - 审计并重排行程时间轴
   - 睡眠锁定期、餐饮锚点、交通缓冲、体力节奏
   - 运行时 Skill：`itinerary.temporalOptimize`

## 与系统 Agent 的区别

### 系统 Skills（本目录）

- **用途**：系统运行时执行具体能力
- **位置**：`prompts/skills/`
- **特点**：
  - 是系统能力的一部分
  - 在运行时被调用
  - 有具体的实现代码（`src/skills/`）
  - 被 Agent 调用执行任务

### 系统 Agent（`prompts/agents/`）

- **用途**：系统运行时执行具体任务
- **位置**：`prompts/agents/`
- **特点**：
  - 是系统架构的一部分
  - 在运行时被调用
  - 有具体的实现代码（`src/agent/services/sub-agents/`）
  - 映射到三人格系统（Abu、Dr.Dre、Neptune）
  - 调用 Skills 执行任务

## 参考文档

- `src/skills/README.md` - Skills 架构说明
- `src/skills/interfaces/skill.interface.ts` - Skill 接口定义
- `prompts/agents/README.md` - 系统 Agent 文档
