import {
  INTENT_ANALYSIS_PROMPT,
  ROUTING_DECISION_PROMPT,
  SKILLS_SELECTION_PROMPT,
} from '../services/claude-orchestration-prompts';
import type {
  IntentAnalysis,
  RoutingDecision,
  SkillsPlan,
} from '../interfaces/claude-orchestration.interface';
import { resolveDestinationLlmPromptSupplement } from './destination-llm-prompt-supplement.util';

export function isOrchestrationTriageEnabled(): boolean {
  const v = process.env.ORCHESTRATION_TRIAGE_LLM ?? '1';
  return v === '1' || v === 'true';
}

export const ORCHESTRATION_TRIAGE_PROMPT = `
[角色定位]

你是 TripNARA 编排分流专家。在**单次**推理中完成：
1) 用户意图分析
2) System1 vs System2 路由决策
3) System2 路径下的 Skills 初选

[核心原则]

- Gate 在 Plan 之前；规划类请求不得跳过 RESEARCH → GATE_EVAL。
- 简单 CRUD / 事实查询优先 System1；需证据核验或行程生成走 System2。
- Skills 选择遵守 smart_update 规约：默认 itinerary.smart_update，勿并列 verify+repair。
- 稀疏极地（GL/SJ）：允许 open-world elastic 节点，勿因 POI 稀疏判失败。

[输出]

只返回 JSON（无 markdown 围栏），结构：

{
  "intentAnalysis": {
    "intentType": "simple_query" | "complex_planning" | "analysis" | "decision" | "mixed",
    "complexity": "simple" | "medium" | "complex",
    "requiredCapabilities": ["..."],
    "confidence": 0.0-1.0,
    "reasoning": "...",
    "keywords": ["..."],
    "entities": { "destination": "...", "date": "...", "action": "..." }
  },
  "routingDecision": {
    "route": "SYSTEM1_API" | "SYSTEM1_RAG" | "SYSTEM2_REASONING" | "SYSTEM2_ANALYSIS" | "SYSTEM2_WEBBROWSE",
    "confidence": 0.0-1.0,
    "reasoning": "...",
    "budget": { "max_seconds": number, "max_steps": number, "max_browser_steps": number },
    "requiredCapabilities": ["..."],
    "consentRequired": false,
    "selected_path": "FAST" | "DEEP"
  },
  "skillsPlan": {
    "selectedSkills": [
      { "skillName": "...", "reason": "...", "priority": 1, "input": {}, "dependencies": [] }
    ],
    "executionOrder": ["skillName..."],
    "dependencies": {}
  }
}

若 routingDecision.route 以 SYSTEM1 开头，skillsPlan 可为空数组。
`;

export function buildOrchestrationTriagePrompt(params: {
  userMessage: string;
  userId?: string;
  tripId?: string;
  conversationHistory?: string[];
  availableSkills: Array<{ name: string; description: string }>;
  destinationSupplement?: string;
}): string {
  const skillsList = params.availableSkills
    .map((s) => `- ${s.name}: ${s.description}`)
    .join('\n');

  const destBlock = params.destinationSupplement?.trim()
    ? `\n[目的地特化规则]\n${params.destinationSupplement.trim()}\n`
    : '';

  return `
${ORCHESTRATION_TRIAGE_PROMPT}

--- 参考：意图分析维度 ---
${INTENT_ANALYSIS_PROMPT.slice(0, 1200)}…

--- 参考：路由策略 ---
${ROUTING_DECISION_PROMPT.slice(0, 1200)}…

--- 参考：Skills 选择（节选） ---
${SKILLS_SELECTION_PROMPT.slice(0, 2000)}…

[用户请求]
${params.userMessage}

[上下文]
- 用户 ID: ${params.userId ?? '无'}
- 行程 ID: ${params.tripId ?? '无'}
- 对话历史: ${params.conversationHistory?.join('\n') || '无'}
${destBlock}
[可用 Skills]
${skillsList}

请一次性输出 intentAnalysis + routingDecision + skillsPlan。
`.trim();
}

const ROUTES: RoutingDecision['route'][] = [
  'SYSTEM1_API',
  'SYSTEM1_RAG',
  'SYSTEM2_REASONING',
  'SYSTEM2_ANALYSIS',
  'SYSTEM2_WEBBROWSE',
];

const INTENT_TYPES: IntentAnalysis['intentType'][] = [
  'simple_query',
  'complex_planning',
  'analysis',
  'decision',
  'mixed',
];

const COMPLEXITIES: IntentAnalysis['complexity'][] = ['simple', 'medium', 'complex'];

function normalizeIntentAnalysis(raw: unknown): IntentAnalysis | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const intentType = p.intentType;
  const complexity = p.complexity;
  if (
    typeof intentType !== 'string' ||
    !INTENT_TYPES.includes(intentType as IntentAnalysis['intentType']) ||
    typeof complexity !== 'string' ||
    !COMPLEXITIES.includes(complexity as IntentAnalysis['complexity'])
  ) {
    return null;
  }
  const confidence =
    typeof p.confidence === 'number' && !Number.isNaN(p.confidence)
      ? Math.min(1, Math.max(0, p.confidence))
      : 0.5;
  const reasoning =
    typeof p.reasoning === 'string' && p.reasoning.trim() ? p.reasoning : 'triage 未返回 reasoning';
  const requiredCapabilities = Array.isArray(p.requiredCapabilities)
    ? p.requiredCapabilities.filter((x) => typeof x === 'string')
    : ['data_query'];
  return {
    intentType: intentType as IntentAnalysis['intentType'],
    complexity: complexity as IntentAnalysis['complexity'],
    requiredCapabilities,
    confidence,
    reasoning,
    ...(Array.isArray(p.keywords) ? { keywords: p.keywords.filter((x) => typeof x === 'string') } : {}),
    ...(p.entities && typeof p.entities === 'object' ? { entities: p.entities as Record<string, unknown> } : {}),
  };
}

function normalizeRoutingDecision(raw: unknown): RoutingDecision | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const route = p.route;
  if (typeof route !== 'string' || !ROUTES.includes(route as RoutingDecision['route'])) return null;
  const confidence =
    typeof p.confidence === 'number' && !Number.isNaN(p.confidence)
      ? Math.min(1, Math.max(0, p.confidence))
      : 0.5;
  const reasoning =
    typeof p.reasoning === 'string' && p.reasoning.trim() ? p.reasoning : 'triage 路由';
  const b = p.budget;
  let budget: RoutingDecision['budget'] = { max_seconds: 60, max_steps: 8, max_browser_steps: 0 };
  if (b && typeof b === 'object') {
    const bb = b as Record<string, unknown>;
    budget = {
      max_seconds: typeof bb.max_seconds === 'number' ? bb.max_seconds : 60,
      max_steps: typeof bb.max_steps === 'number' ? bb.max_steps : 8,
      max_browser_steps: typeof bb.max_browser_steps === 'number' ? bb.max_browser_steps : 0,
    };
  }
  const out: RoutingDecision = {
    route: route as RoutingDecision['route'],
    confidence,
    reasoning,
    budget,
  };
  if (Array.isArray(p.requiredCapabilities)) {
    out.requiredCapabilities = p.requiredCapabilities.filter((x) => typeof x === 'string');
  }
  if (typeof p.consentRequired === 'boolean') out.consentRequired = p.consentRequired;
  if (typeof p.selected_path === 'string') out.selected_path = p.selected_path;
  return out;
}

function normalizeSkillsPlan(raw: unknown): SkillsPlan {
  if (!raw || typeof raw !== 'object') {
    return { selectedSkills: [], executionOrder: [], dependencies: {} };
  }
  const p = raw as Record<string, unknown>;
  const selectedSkills = Array.isArray(p.selectedSkills)
    ? p.selectedSkills
        .filter((s) => s && typeof s === 'object')
        .map((s) => {
          const o = s as Record<string, unknown>;
          return {
            skillName: String(o.skillName ?? ''),
            reason: String(o.reason ?? ''),
            priority: typeof o.priority === 'number' ? o.priority : 1,
            input: (o.input && typeof o.input === 'object' ? o.input : {}) as Record<string, unknown>,
            dependencies: Array.isArray(o.dependencies)
              ? o.dependencies.filter((d) => typeof d === 'string')
              : [],
          };
        })
        .filter((s) => s.skillName.length > 0)
    : [];
  return {
    selectedSkills,
    executionOrder: Array.isArray(p.executionOrder)
      ? p.executionOrder.filter((x) => typeof x === 'string')
      : selectedSkills.map((s) => s.skillName),
    dependencies:
      p.dependencies && typeof p.dependencies === 'object'
        ? (p.dependencies as Record<string, string[]>)
        : {},
  };
}

export function normalizeOrchestrationTriageResult(parsed: unknown): {
  intentAnalysis: IntentAnalysis;
  routingDecision: RoutingDecision;
  skillsPlan: SkillsPlan;
} | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const root = parsed as Record<string, unknown>;
  const intentAnalysis = normalizeIntentAnalysis(root.intentAnalysis);
  const routingDecision = normalizeRoutingDecision(root.routingDecision);
  if (!intentAnalysis || !routingDecision) return null;
  const skillsPlan = normalizeSkillsPlan(root.skillsPlan);
  return { intentAnalysis, routingDecision, skillsPlan };
}

export function buildDestinationSupplementForTriage(
  userMessage: string,
  tripId?: string,
): string | undefined {
  return resolveDestinationLlmPromptSupplement({
    userMessage,
    destinationHint: userMessage,
  });
}

/** JSON Schema for callLlmWithSchema */
export const ORCHESTRATION_TRIAGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intentAnalysis: {
      type: 'object',
      properties: {
        intentType: {
          type: 'string',
          enum: ['simple_query', 'complex_planning', 'analysis', 'decision', 'mixed'],
        },
        complexity: { type: 'string', enum: ['simple', 'medium', 'complex'] },
        requiredCapabilities: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number' },
        reasoning: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        entities: { type: 'object' },
      },
      required: ['intentType', 'complexity', 'requiredCapabilities', 'confidence', 'reasoning'],
    },
    routingDecision: {
      type: 'object',
      properties: {
        route: {
          type: 'string',
          enum: [
            'SYSTEM1_API',
            'SYSTEM1_RAG',
            'SYSTEM2_REASONING',
            'SYSTEM2_ANALYSIS',
            'SYSTEM2_WEBBROWSE',
          ],
        },
        confidence: { type: 'number' },
        reasoning: { type: 'string' },
        budget: {
          type: 'object',
          properties: {
            max_seconds: { type: 'number' },
            max_steps: { type: 'number' },
            max_browser_steps: { type: 'number' },
          },
          required: ['max_seconds', 'max_steps', 'max_browser_steps'],
        },
        consentRequired: { type: 'boolean' },
        selected_path: { type: 'string' },
      },
      required: ['route', 'confidence', 'reasoning', 'budget'],
    },
    skillsPlan: {
      type: 'object',
      properties: {
        selectedSkills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              skillName: { type: 'string' },
              reason: { type: 'string' },
              priority: { type: 'number' },
              input: { type: 'object' },
              dependencies: { type: 'array', items: { type: 'string' } },
            },
            required: ['skillName', 'reason', 'priority', 'input'],
          },
        },
        executionOrder: { type: 'array', items: { type: 'string' } },
        dependencies: { type: 'object' },
      },
      required: ['selectedSkills', 'executionOrder', 'dependencies'],
    },
  },
  required: ['intentAnalysis', 'routingDecision', 'skillsPlan'],
} as const;
