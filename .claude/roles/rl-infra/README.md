# RL Infrastructure 角色文档

**状态**：✅ **基础架构已完成**（2025-01-21）  
**ROLL 迁移**：✅ **Phase 1 & Phase 2 完成**（2026-01-21）

> 📋 **实施完成总结**：详见 [`IMPLEMENTATION_COMPLETE_SUMMARY.md`](./IMPLEMENTATION_COMPLETE_SUMMARY.md)  
> 📋 **API参考**：详见 [`API_REFERENCE.md`](./API_REFERENCE.md)  
> 🚀 **下一步行动**：详见 [`NEXT_STEPS.md`](./NEXT_STEPS.md)  
> 📋 **TODO清单**：详见 [`TODO_CHECKLIST.md`](./TODO_CHECKLIST.md)  
> 🚀 **快速开始**：详见 [`QUICK_START.md`](./QUICK_START.md)

本文件夹包含TripNARA RL基础设施的所有角色文档，用于指导RL系统的构建和运营。

> 📋 **批准记录**：详见 [`APPROVAL_RECORD.md`](./APPROVAL_RECORD.md)  
> 📋 **实施计划**：详见 [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)  
> 📋 **评估报告**：详见 [`IMPLEMENTATION_ASSESSMENT.md`](./IMPLEMENTATION_ASSESSMENT.md)

## 📋 目录结构

```
rl-infra/
├── README.md                                    # 本文件
│
├── 快速开始/
│   ├── QUICK_START.md                          # ⭐ 快速启动指南（新成员先看这个）
│   ├── IMPLEMENTATION_PLAN.md                  # ⭐ 详细实施计划（任务清单）
│   ├── IMPLEMENTATION_ASSESSMENT.md            # ⭐ 实施计划评估报告
│   ├── IMPLEMENTATION_COMPLETE_SUMMARY.md      # ✅ 实施完成总结
│   ├── API_REFERENCE.md                        # 📚 API参考文档
│   ├── NEXT_STEPS.md                           # 🚀 下一步行动指南
│   ├── TODO_CHECKLIST.md                      # 📋 TODO清单
│   └── APPROVAL_RECORD.md                      # ✅ 批准记录
│
├── 架构与评估/
│   ├── SYSTEM_ARCHITECTURE.md                  # 系统架构图（含RL infra）
│   ├── NEED_ASSESSMENT.md                      # RL Infrastructure需求评估
│   ├── RL_INFRASTRUCTURE_ASSESSMENT.md         # RL基础设施评估报告
│   ├── ROLL_ARCHITECTURE_MIGRATION_ASSESSMENT.md  # ⭐ ROLL架构迁移评估
│   ├── ROLL_MIGRATION_ROLE_ASSESSMENTS.md      # ⭐ ROLL迁移角色评估模板
│   ├── ROLL_MIGRATION_POC_PLAN.md             # ⭐ ROLL迁移POC计划
│   ├── ROLL_MIGRATION_IMPLEMENTATION_PLAN.md  # ⭐ ROLL迁移实施计划
│   ├── ROLL_MIGRATION_STATUS.md               # ⭐ ROLL迁移状态跟踪
│   ├── ROLL_PHASE1_COMPLETE.md                # ✅ ROLL Phase 1 完成总结
│   ├── ROLL_PHASE2_SUMMARY.md                 # ✅ ROLL Phase 2 总结
│   ├── ROLL_PHASE3_MONITORING.md              # ✅ ROLL Phase 3 监控系统
│   ├── ROLL_PHASE3_ERROR_HANDLING.md          # ✅ ROLL Phase 3 错误处理
│   ├── ROLL_PHASE3_PERFORMANCE.md             # ✅ ROLL Phase 3 性能优化
│   ├── ROLL_PHASE3_TRACING.md                 # ✅ ROLL Phase 3 分布式追踪
│   ├── ROLL_PHASE3_PROGRESS.md                # ✅ ROLL Phase 3 进展（已完成）
│   ├── ROLL_INTEGRATION_COMPLETE.md           # ✅ ROLL 可选集成完成
│   ├── ROLL_AB_TEST_COMPLETE.md               # ✅ ROLL A/B 测试集成完成
│   ├── ROLL_API_DOCUMENTATION.md              # ✅ ROLL API 接口文档
│   ├── ADMIN_API_DOCUMENTATION.md             # ✅ 后台管理系统 API 文档
│   ├── CONTEXT_API_DOCUMENTATION.md           # ✅ Context Engine API 文档
│   ├── FRONTEND_BACKEND_API_MAPPING.md        # ✅ 前后端接口对接指南
│   ├── scripts/rl-infra/roll/
│   │   ├── Dockerfile                          # ✅ Docker 镜像构建文件
│   │   ├── docker-compose.yml                 # ✅ Docker Compose 配置
│   │   ├── k8s/                                # ✅ Kubernetes 配置
│   │   │   ├── ray-cluster.yaml               # ✅ Ray 集群配置
│   │   │   └── bridge-service.yaml            # ✅ Bridge Service 配置
│   │   ├── PRODUCTION_DEPLOYMENT.md           # ✅ 生产环境部署指南
│   │   ├── CI_CD_INTEGRATION.md               # ✅ CI/CD 集成指南
│   │   ├── Jenkinsfile                        # ✅ Jenkins Pipeline 配置
│   │   └── .github/workflows/roll-ci.yml      # ✅ GitHub Actions 配置
│   ├── ROLL_MIGRATION_COMPLETE.md             # ✅ ROLL迁移完成总结
│   ├── ROLL_NEXT_STEPS.md                     # 🚀 ROLL下一步行动
│   ├── ROLL_FINAL_SUMMARY.md                  # ✅ ROLL最终总结
│   └── ROLL_QUICK_REFERENCE.md                # ⭐ ROLL快速参考
│
└── 角色文档/
    ├── rl-ml-platform-engineer.md              # RL/ML Platform Engineer角色
    ├── data-engineer-trajectory.md              # Data Engineer（轨迹数据工程）角色
    ├── evaluation-engineer.md                  # Evaluation Engineer角色
    ├── backend-infra-engineer.md                # Backend/Infra Engineer角色
    ├── safety-compliance-lead.md                # Safety/Compliance Lead角色
    ├── pm-rl-product.md                         # PM（RL产品负责人）角色
    ├── ux-writer.md                             # UX Writer / Interaction Designer角色
    ├── domain-expert-network.md                 # Domain Expert Network角色
    └── llm-judge-rm-engineer.md                 # LLM Judge / RM Engineer角色
```

## 🎯 角色概览

## 🧩 基于当前项目实际的专家团队配置（推荐）

结合当前仓库状态（ROLL gate/canary/ramp/readiness 已有脚本与工作流）：

- 已具备：staging/prod gate、canary 放量与回滚、release health score、week1-3 readiness 检查
- 当前主风险：发布门禁一致性、回滚时效、阈值治理、评测闭环

建议采用 **“核心必备 + 按需专家”** 的团队配置，而不是全角色同时常驻。

### A. 核心必备（发布链路必须常驻）

1. **Backend/Infra Engineer**  
   - 负责 Orchestrator 接入、运行时契约、观测、熔断限流
2. **RL/ML Platform Engineer**  
   - 负责 bridge/worker 稳定性、训练与推理平台、服务编排
3. **SRE / Safety-Operations Owner**  
   - 负责 prod guardrail、canary/rollback、发布窗口处置
4. **Evaluation Engineer**  
   - 负责 release health score、readiness gate、离线评测结论
5. **PM（RL产品负责人）**  
   - 负责 KPI 阈值确认、Go/No-Go 拍板、灰度节奏
6. **Data Engineer（轨迹数据工程）**  
   - 负责训练/评测数据质量、版本化与脱敏

### B. 按需专家（触发条件满足时介入）

1. **UX Writer / Interaction Designer（按需）**  
   - 触发条件：新增/变更用户可见风险提示、审批确认文案、解释结构  
   - 注意：不参与纯后端性能与基础设施改造
2. **Domain Expert Network（按需）**  
   - 触发条件：高风险目的地扩展、季节性规则更新、反例库补充
3. **LLM Judge / RM Engineer（按需）**  
   - 触发条件：上线前质量评分争议、reward 偏移、模型投机风险上升

### P0角色（立即实施）

1. **RL/ML Platform Engineer**（训练与服务平台工程）
   - 职责：训练流水线、模型注册表、在线Serving、特征存储
   - 文档：`rl-ml-platform-engineer.md`

2. **Data Engineer**（轨迹数据工程）
   - 职责：轨迹ETL、数据质量、PII脱敏、数据集版本化
   - 文档：`data-engineer-trajectory.md`

### P1角色（1-2个月）

3. **Evaluation Engineer**（离线评测 & 反事实评估）
   - 职责：Eval Suite、OPE实现、回放对照、回归门槛
   - 文档：`evaluation-engineer.md`

4. **Backend/Infra Engineer**（核心编排与观测）
   - 职责：Orchestrator接入、统一观测、熔断限流、成本治理
   - 文档：`backend-infra-engineer.md`

### P2角色（2-3个月）

5. **Safety/Compliance Lead**（安全合规负责人）
   - 职责：Constraints Engine、风险事件分级、合规审计、安全红队
   - 文档：`safety-compliance-lead.md`

6. **PM（RL产品负责人）**（Decision Quality PM）
   - 职责：Reward定义、用户反馈闭环、A/B实验设计、可解释输出
   - 文档：`pm-rl-product.md`

### P3角色（按需投入，不要求常驻）

7. **UX Writer / Interaction Designer**（解释与信任体验）
   - 职责：追问话术、风险提示、决策解释、反馈入口
   - 介入边界：仅在用户可见链路字段/文案/解释结构变更时介入
   - 文档：`ux-writer.md`

8. **Domain Expert Network**（目的地/户外安全顾问）
   - 职责：红线规则、季节性风险、评测集标注、反例库
   - 文档：`domain-expert-network.md`
   - 形式：不一定全职，可以顾问制

9. **LLM Judge / RM Engineer**（奖励模型工程）
   - 职责：Judge Prompts、RM训练/蒸馏、诊断标签、质量评分
   - 文档：`llm-judge-rm-engineer.md`

### 可选增强（规模化后再补）

10. **Frontend Engineer**（评测与灰度可视化台）
    - 职责：实验看板、回放工具、策略对比UI、审核台

11. **SRE / FinOps**（成本与可靠性）
    - 职责：GPU/推理成本优化、容量规划、SLO、告警、预算守门人

12. **Legal / Privacy Counsel**（数据与责任边界）
    - 职责：日志训练授权、地区合规、免责声明策略、责任界定

## 📊 角色协作关系

```
┌─────────────────────────────────────────────────────────────┐
│                    RL Infrastructure                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Data Engineer│→ │ RL/ML Platform│→ │ Evaluation   │      │
│  │              │  │ Engineer      │  │ Engineer     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │               │
│         ↓                  ↓                  ↓               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Backend/Infra Engineer                       │  │
│  │         (Orchestrator Integration)                   │  │
│  └──────────────────────────────────────────────────────┘  │
│         │                  │                  │               │
│         ↓                  ↓                  ↓               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Safety/      │  │ PM (RL       │  │ UX Writer    │      │
│  │ Compliance   │  │ Product)     │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                  │                  │               │
│         ↓                  ↓                  ↓               │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │ Domain Expert│  │ LLM Judge/   │                         │
│  │ Network      │  │ RM Engineer  │                         │
│  └──────────────┘  └──────────────┘                         │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 实施路径

### 阶段1：数据管道与训练平台（1-2个月）

**目标**：建立完整的轨迹数据管道和训练平台

**任务**：
1. Data Engineer：实现轨迹ETL（DecisionLog → s,a,r,s'）
2. Data Engineer：实现数据质量规则和PII脱敏
3. RL/ML Platform Engineer：搭建训练流水线（Ray/K8s）
4. RL/ML Platform Engineer：实现Model Registry（MLflow）

**成功标准**：
- ✅ 能够从生产环境收集轨迹并转换为训练格式
- ✅ 能够自动化训练模型并注册到Model Registry
- ✅ 训练数据质量检查通过率 > 95%

### 阶段2：评测体系与Serving（1-2个月）

**目标**：建立离线评测体系和在线Serving能力

**任务**：
1. Evaluation Engineer：构建Eval Suite（Router/Gate/Itinerary）
2. Evaluation Engineer：实现OPE（DR/WDR）
3. RL/ML Platform Engineer：实现PolicyService在线推理
4. Backend/Infra Engineer：接入Orchestrator

**成功标准**：
- ✅ Eval Suite覆盖Router/Gate/Itinerary三个关键组件
- ✅ OPE能够准确评估策略性能（与在线A/B测试相关性 > 0.8）
- ✅ PolicyService QPS > 1000, P95延迟 < 100ms
- ✅ 能够无缝集成到现有Orchestrator

### 阶段3：安全合规与产品化（1-2个月）

**目标**：建立安全合规体系和产品化能力

**任务**：
1. Safety/Compliance Lead：实现Constraints Engine
2. Safety/Compliance Lead：构建安全红队用例库
3. PM：定义Reward业务含义和A/B实验设计
4. UX Writer：设计用户友好的提示和反馈入口

**成功标准**：
- ✅ Constraints Engine能够阻止高风险规划（误报率 < 1%）
- ✅ 安全红队用例库覆盖高风险目的地/季节
- ✅ A/B实验能够准确评估策略效果
- ✅ 用户反馈收集率 > 30%

### 阶段4：优化与规模化（持续）

**目标**：持续优化和规模化

**任务**：
1. LLM Judge/RM Engineer：实现质量评分模型
2. Domain Expert Network：扩展安全规则和评测集
3. Frontend Engineer：构建可视化工具
4. SRE/FinOps：优化成本和可靠性

## 📚 文档使用指南

### 对于新加入的团队成员

1. **首先阅读**：`QUICK_START.md` ⭐ - 快速启动指南，了解如何开始
2. **然后阅读**：`RL_INFRASTRUCTURE_ASSESSMENT.md` - 了解整体架构和评估
3. **查看计划**：`IMPLEMENTATION_PLAN.md` - 了解详细实施计划
4. **查看架构**：`SYSTEM_ARCHITECTURE.md` - 查看系统架构图
5. **阅读角色文档**：对应角色的文档 - 了解具体职责和工作方式
6. **参考协作**：查看"与项目其他组件的协作"章节 - 了解如何与其他角色协作

### 对于开始实施的工程师

1. **阅读快速启动**：`QUICK_START.md` - 了解如何开始实施
2. **查看实施计划**：`IMPLEMENTATION_PLAN.md` - 查看详细任务清单
3. **阅读角色文档**：对应角色的文档 - 了解具体实施要求
4. **查看代码参考**：角色文档中的"项目关键文件位置"章节

### 🚀 对于新加入的团队成员（立即开始实施）

1. **首先阅读**：`QUICK_START.md` ⭐ - 快速启动指南，了解如何开始
2. **查看计划**：`IMPLEMENTATION_PLAN.md` - 了解详细实施计划
3. **查看架构**：`SYSTEM_ARCHITECTURE.md` - 查看系统架构图
4. **阅读角色文档**：对应角色的文档 - 了解具体职责和工作方式
5. **参考协作**：查看"与项目其他组件的协作"章节 - 了解如何与其他角色协作

### 🏗️ 对于架构师和技术负责人

1. **阅读评估报告**：`RL_INFRASTRUCTURE_ASSESSMENT.md` - 了解整体架构设计
2. **阅读需求评估**：`NEED_ASSESSMENT.md` - 了解是否需要RL Infrastructure
3. **查看架构图**：`SYSTEM_ARCHITECTURE.md` - 查看完整系统架构
4. **阅读P0角色文档**：了解基础架构需求
5. **阅读协作关系**：了解角色间的协作机制

### 📊 对于产品经理

1. **阅读需求评估**：`NEED_ASSESSMENT.md` - 了解是否需要RL Infrastructure
2. **阅读PM角色文档**：`pm-rl-product.md` - 了解RL产品管理
3. **阅读评估报告**：`RL_INFRASTRUCTURE_ASSESSMENT.md` - 了解业务目标和成功指标
4. **阅读UX Writer文档**：`ux-writer.md` - 了解用户体验设计
5. **查看实施计划**：`IMPLEMENTATION_PLAN.md` - 了解实施时间线和里程碑

## 🔗 相关文档

### 项目核心文档

- `.claude/roles/chief-ai-scientist.md` - 首席AI科学家角色（RL理论基础）
- `.claude/roles/architect.md` - 架构师角色（Iterative Deployment）
- `docs/ITERATIVE_DEPLOYMENT_APPLICATION.md` - Iterative Deployment应用分析

### 代码参考

- `src/agent/training/` - 训练相关代码
- `src/agent/services/sub-agents/` - Sub-Agents实现
- `src/agent/services/claude-orchestrator.service.ts` - Claude编排器
- `prisma/schema.prisma` - 数据模型定义

## 📝 更新日志

- **2025-01-20**：创建RL基础设施评估报告和所有角色文档
- **2025-01-20**：完成P0-P3角色的文档创建
- **2025-01-20**：创建详细实施计划（IMPLEMENTATION_PLAN.md）
- **2025-01-20**：创建快速启动指南（QUICK_START.md）
- **2025-01-20**：创建系统架构图（SYSTEM_ARCHITECTURE.md）
- **2025-01-20**：创建需求评估（NEED_ASSESSMENT.md）

## 🤝 贡献指南

1. **更新角色文档**：如果角色职责发生变化，请更新对应文档
2. **添加新角色**：如果需要新增角色，请创建新文档并更新README
3. **更新评估报告**：如果架构发生变化，请更新评估报告

## 📧 联系方式

如有问题或建议，请联系：
- **首席AI科学家**：负责RL基础设施整体评估和架构设计
- **架构师**：负责系统架构设计和实施路径

---

**记住**：RL基础设施的构建是一个长期过程，需要各角色的紧密协作。当前阶段应以构建基础架构为主，逐步完善功能和性能。
