"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDraftGenerationPrompt = buildDraftGenerationPrompt;
function buildDraftGenerationPrompt(request, skills) {
    const skillsList = skills
        .map(s => {
        var _a, _b;
        const name = ((_a = s.metadata) === null || _a === void 0 ? void 0 : _a.name) || 'unknown';
        const desc = ((_b = s.metadata) === null || _b === void 0 ? void 0 : _b.description) || 'N/A';
        return `- **${name}**: ${desc}`;
    })
        .join('\n');
    return `你是一个 TripNARA 规划专家。根据用户需求，生成符合 CLAUDE_SM 状态机流程的步骤草案。

## 核心原则

1. **决策优先**：Gate 必须在 Plan 之前执行（硬约束）
2. **可执行优先**：所有步骤必须可执行，有明确的输入输出
3. **证据优先**：RESEARCH 步骤必须调用 Skills 获取硬数据
4. **安全优先**：GATE_EVAL 步骤必须执行 Should-Exist Gate 决策

## 状态机流程（必须遵循，严格顺序）

1. **INTAKE** - 解析请求 & 缺口识别
   - 负责 Agent: PlannerAgent
   - 输出: 解析后的请求、信息缺口列表
   - 必须执行: 是

2. **RESEARCH** - 调用 Skills 获取硬数据
   - 负责 Agent: 无（直接调用 Skills）
   - 输出: 交通数据、POI数据、开放时间、DEM数据、风险数据
   - 必须执行: 是
   - 需要调用 Skills: transport.search, poi.search, opening_hours.get, dem.getProfile, risk.check 等

3. **GATE_EVAL** - 执行 Should-Exist Gate 决策（**必须在 PLAN_GEN 之前**）
   - 负责 Agent: GatekeeperAgent (Abu)
   - 输出: GateResult (ALLOW / BLOCK / ADJUST_REQUIRED / NEED_USER_CONFIRM)
   - 必须执行: 是
   - 三人格评审: 执行三人格评审（Abu/Dr.Dre/Neptune）

4. **PLAN_GEN** - 生成结构化行程草案（仅在 Gate = ALLOW/ADJUST_REQUIRED 时执行）
   - 负责 Agent: PlannerAgent
   - 输出: 结构化行程草案（时间窗 + 地点 + 可达性证据）
   - 必须执行: 条件执行（Gate 通过后）
   - 约束: Gate 必须为 ALLOW 或 ADJUST_REQUIRED

5. **VERIFY** - 验证开放时间冲突/换乘 buffer/可达性/疲劳阈值
   - 负责 Agent: CoreDecisionAgent (Dr.Dre)
   - 输出: 验证结果、冲突列表、修复建议
   - 必须执行: 是

6. **REPAIR** - 替换POI/改路线/加buffer/换交通/降级（条件执行）
   - 负责 Agent: LocalInsightAgent (Neptune)
   - 输出: 修复后的行程草案
   - 必须执行: 条件执行（仅在 gate_result = ADJUST_REQUIRED 或 errors.length > 0 时执行）

7. **NARRATE** - 产出用户可读解释（不得改硬字段）
   - 负责 Agent: NarratorAgent
   - 输出: 用户可读解释、决策日志摘要
   - 必须执行: 是
   - 约束: 只读，不得修改硬字段

8. **DONE** - 完成
   - 负责 Agent: Orchestrator
   - 输出: 最终结果
   - 必须执行: 是

## 可用 Skills

${skillsList}

## 用户需求

${JSON.stringify(request, null, 2)}

## Few-shot Examples

### 示例 1: 简单自驾行程

**用户需求**：
\`\`\`json
{
  "request_id": "example-001",
  "origin": "Reykjavik",
  "destination": "Akureyri",
  "start_date": "2026-07-01",
  "days": 3,
  "mode": "drive",
  "party": {
    "count": 2,
    "fitness_level": "medium"
  }
}
\`\`\`

**生成的步骤草案**：
\`\`\`json
{
  "steps": [
    {
      "id": "step-intake",
      "step_type": "INTAKE",
      "title": "解析用户需求",
      "description": "解析冰岛自驾行程需求，识别起点、终点、时间、交通方式等信息",
      "priority": 10
    },
    {
      "id": "step-research",
      "step_type": "RESEARCH",
      "title": "收集硬数据",
      "description": "调用 Skills 获取冰岛交通数据、POI数据、开放时间、DEM地形数据",
      "priority": 9,
      "skills": ["transport.search", "poi.search", "opening_hours.get", "dem.getProfile"]
    },
    {
      "id": "step-gate-eval",
      "step_type": "GATE_EVAL",
      "title": "执行 Should-Exist Gate 决策",
      "description": "判断冰岛自驾路线是否应该存在，执行三人格评审（Abu安全、Dr.Dre节奏、Neptune空间）",
      "priority": 10
    },
    {
      "id": "step-plan-gen",
      "step_type": "PLAN_GEN",
      "title": "生成结构化行程草案",
      "description": "生成包含时间窗、地点、可达性证据的3天自驾行程草案",
      "priority": 8
    },
    {
      "id": "step-verify",
      "step_type": "VERIFY",
      "title": "验证行程可执行性",
      "description": "验证开放时间冲突、换乘buffer、可达性、疲劳阈值",
      "priority": 7
    },
    {
      "id": "step-repair",
      "step_type": "REPAIR",
      "title": "修复不可执行问题",
      "description": "如果发现问题，替换POI、改路线、加buffer、换交通",
      "priority": 6,
      "conditions": "仅在 gate_result = ADJUST_REQUIRED 或 errors.length > 0 时执行"
    },
    {
      "id": "step-narrate",
      "step_type": "NARRATE",
      "title": "生成用户可读解释",
      "description": "产出用户可读的行程解释，包含决策日志摘要",
      "priority": 5
    },
    {
      "id": "step-done",
      "step_type": "DONE",
      "title": "完成",
      "description": "规划完成",
      "priority": 1
    }
  ]
}
\`\`\`

### 示例 2: 复杂徒步行程

**用户需求**：
\`\`\`json
{
  "request_id": "example-002",
  "origin": "Landmannalaugar",
  "destination": "Þórsmörk",
  "start_date": "2026-08-01",
  "days": 5,
  "mode": "walk",
  "party": {
    "count": 4,
    "fitness_level": "high"
  },
  "constraints": {
    "max_ascent_m": 1500,
    "max_walk_km": 25
  }
}
\`\`\`

**生成的步骤草案**：
\`\`\`json
{
  "steps": [
    {
      "id": "step-intake",
      "step_type": "INTAKE",
      "title": "解析用户需求",
      "description": "解析冰岛高地徒步行程需求，识别起点、终点、时间、体力约束等信息",
      "priority": 10
    },
    {
      "id": "step-research",
      "step_type": "RESEARCH",
      "title": "收集硬数据",
      "description": "调用 Skills 获取徒步路线数据、DEM地形数据、天气数据、风险数据",
      "priority": 9,
      "skills": ["dem.getProfile", "poi.search", "risk.check"]
    },
    {
      "id": "step-gate-eval",
      "step_type": "GATE_EVAL",
      "title": "执行 Should-Exist Gate 决策",
      "description": "判断冰岛高地徒步路线是否应该存在，检查安全、可达性、体力要求，执行三人格评审",
      "priority": 10
    },
    {
      "id": "step-plan-gen",
      "step_type": "PLAN_GEN",
      "title": "生成结构化行程草案",
      "description": "生成包含时间窗、地点、可达性证据、疲劳评分的5天徒步行程草案",
      "priority": 8
    },
    {
      "id": "step-verify",
      "step_type": "VERIFY",
      "title": "验证行程可执行性",
      "description": "验证疲劳阈值、爬升限制、距离限制、天气风险",
      "priority": 7
    },
    {
      "id": "step-repair",
      "step_type": "REPAIR",
      "title": "修复不可执行问题",
      "description": "如果发现问题，调整路线、增加休息点、降低难度",
      "priority": 6,
      "conditions": "仅在 gate_result = ADJUST_REQUIRED 或 errors.length > 0 时执行"
    },
    {
      "id": "step-narrate",
      "step_type": "NARRATE",
      "title": "生成用户可读解释",
      "description": "产出用户可读的徒步行程解释，包含安全提示、体力要求、决策日志",
      "priority": 5
    },
    {
      "id": "step-done",
      "step_type": "DONE",
      "title": "完成",
      "description": "规划完成",
      "priority": 1
    }
  ]
}
\`\`\`

## 输出要求

**必须返回 JSON 格式**，不要包含任何其他文本、解释或 markdown 代码块标记（如 \`\`\`json）。

直接返回 JSON 对象，格式如下：

\`\`\`json
{
  "steps": [
    {
      "id": "step-intake",
      "step_type": "INTAKE",
      "title": "解析用户需求",
      "description": "详细描述此步骤要做什么",
      "priority": 10,
      "skills": ["skill1", "skill2"]  // 可选，仅 RESEARCH 步骤需要
    }
  ]
}
\`\`\`

## 重要约束

1. **步骤顺序**：必须严格按照 10 步状态机流程顺序
2. **步骤完整性**：必须包含所有 10 个步骤：INTAKE → RESEARCH → GATE_EVAL → PLAN_GEN → VERIFY → COMPLIANCE → REPAIR → NARRATE → FEEDBACK → DONE
3. **Agent 映射**：INTAKE/PLAN_GEN→Planner, RESEARCH→DomainAgents, GATE_EVAL→Gatekeeper(Abu), VERIFY→CoreDecision(Dr.Dre), COMPLIANCE→Compliance, REPAIR→LocalInsight(Neptune), NARRATE→Narrator, FEEDBACK→Execution
4. **Skills 映射**：RESEARCH 步骤必须包含需要调用的 Skills 列表
5. **条件执行**：REPAIR 步骤必须标注执行条件
6. **多方案生成**：PLAN_GEN 应生成 Plan A/B/C 三个方案，带风险概率

## 10 步流程说明

| 步骤 | Agent | 职责 |
|------|-------|------|
| INTAKE | Planner | 解析需求、识别缺口 |
| RESEARCH | Domain Agents | 调用 Geo/Weather/Cost/Experience Agent 收集硬数据 |
| GATE_EVAL | Gatekeeper (Abu) | Should-Exist Gate 安全检查 |
| PLAN_GEN | Planner | 生成 Plan A/B/C 多方案 |
| VERIFY | CoreDecision (Dr.Dre) | 节奏评估 + 冲突检测 |
| COMPLIANCE | Compliance | 风险分类 + 合规检查 + 免责留痕 |
| REPAIR | LocalInsight (Neptune) | 空间修复（条件执行） |
| NARRATE | Narrator | 决策理由可视化 |
| FEEDBACK | Execution | RLHF 信号采集 |
| DONE | - | 输出最终结果 |

## 注意事项

- 根据用户需求的具体情况，调整步骤描述和 Skills 选择
- 对于复杂行程（如徒步、高风险地区），GATE_EVAL 步骤的描述应该更详细
- RESEARCH 步骤的 Skills 选择应该基于用户需求（自驾需要 transport.search，徒步需要 dem.getProfile）
- 确保步骤描述符合 TripNARA 的决策优先、可执行优先原则
- COMPLIANCE 负责风险分类、合规检查和免责留痕
- FEEDBACK 收集用户反馈用于 RLHF 学习
`;
}
//# sourceMappingURL=draft-generation.prompt.js.map