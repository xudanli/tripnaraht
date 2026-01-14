// src/agent/utils/orchestration-signals.util.ts

import { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

/**
 * 任务类型
 */
export type TaskType =
  | 'TRIP_PLANNING'
  | 'CRUD'
  | 'DATA_LOOKUP'
  | 'CUSTOMER_SUPPORT'
  | 'RAG_QA'
  | 'BOOKING_WORKFLOW'
  | 'GENERIC_QA';

/**
 * 风险级别
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * 复杂度级别
 */
export type ComplexityLevel = 'SIMPLE' | 'MODERATE' | 'COMPLEX';

/**
 * 路由信号（从请求中提取的信号）
 */
export interface RoutingSignals {
  taskType: TaskType;
  risk: RiskLevel;
  needsAudit: boolean;
  latencyBudgetMs: number;
  complexity: ComplexityLevel;
  requiresStructuredOutput: boolean;
  expectsToolCalls: boolean;
  legacyWellSupported: boolean;
}

const DEFAULT_MAX_SECONDS = 60;

/**
 * 从请求中提取路由信号
 * 
 * @param req 路由请求 DTO
 * @returns 路由信号
 */
export function signalsFromRequest(req: RouteAndRunRequestDto): RoutingSignals {
  const msg = (req.message ?? '').trim();
  const msgLower = msg.toLowerCase();

  const options = req.options ?? {};
  const ctx = req.conversation_context ?? {};
  const recentCount = ctx.recent_messages?.length ?? 0;

  // 归一化延迟预算（毫秒）
  const latencyBudgetMs = clampInt((options.max_seconds ?? DEFAULT_MAX_SECONDS) * 1000, 0, 5 * 60_000);

  // 推断各项信号
  const taskType = inferTaskType(req.trip_id, msg, msgLower);
  const complexity = inferComplexity(msg, recentCount);
  const expectsToolCalls = inferExpectsToolCalls(taskType, msg, msgLower, options.allow_webbrowse);
  const requiresStructuredOutput = inferRequiresStructuredOutput(taskType, req.trip_id);
  const needsAudit = inferNeedsAudit(taskType, requiresStructuredOutput, options);
  const risk = inferRisk(taskType, msg, msgLower);

  const legacyWellSupported = inferLegacyWellSupported(taskType, complexity);

  return {
    taskType,
    risk,
    needsAudit,
    latencyBudgetMs,
    complexity,
    requiresStructuredOutput,
    expectsToolCalls,
    legacyWellSupported,
  };
}

/**
 * 推断任务类型
 */
function inferTaskType(tripId: string | null | undefined, msg: string, msgLower: string): TaskType {
  // 有 trip_id → 优先 TRIP_PLANNING
  if (tripId) return 'TRIP_PLANNING';

  // CRUD-ish（需要上下文，避免误触发）
  // 例如"我想删除烦恼"不应该命中 CRUD，需要明确的对象（记录/订单/行程/数据等）
  // 
  // 改进：使用更严格的模式匹配，确保是明确的 CRUD 操作
  // 规则：
  // 1. 必须包含 CRUD 动作词（create/update/delete/新增/创建/更新/删除等）
  // 2. 必须包含明确的对象上下文（行程/订单/记录/数据等）
  // 3. 排除常见的误判场景（如"删除烦恼"、"创建快乐"等抽象概念）
  
  // 英文 CRUD 动作词（必须后跟空格或对象）
  const englishCrudActions = ['create ', 'update ', 'delete ', 'insert ', 'upsert ', 'patch ', 'put ', 'post '];
  
  // 中文 CRUD 动作词
  const chineseCrudActions = ['新增', '创建', '更新', '删除', '改一下', '写入', '保存', '修改', '编辑'];
  
  // 明确的对象上下文（必须与动作词同时出现）
  const crudContextKeywords = [
    // 英文
    'record', 'order', 'trip', 'data', 'item', 'entry', 'row', 'document', 'file',
    // 中文
    '行程', '订单', '记录', '数据', '项目', '条目', '文档', '文件', '信息', '资料',
  ];
  
  // 排除的误判模式（抽象概念，不应被识别为 CRUD）
  const falsePositivePatterns = [
    /(?:删除|delete).*(?:烦恼|烦恼|压力|焦虑|悲伤|痛苦|困难|问题|困扰)/i,
    /(?:创建|create).*(?:快乐|幸福|美好|梦想|希望|未来|回忆)/i,
    /(?:更新|update).*(?:心情|情绪|状态|感觉|感受)/i,
  ];
  
  // 检查是否匹配误判模式
  if (falsePositivePatterns.some(pattern => pattern.test(msg))) {
    // 明确排除误判场景
    // 继续后续判断，不返回 CRUD
  } else {
    // 检查英文 CRUD 模式
    if (matchesAny(msgLower, englishCrudActions)) {
      // 必须同时包含对象上下文
      if (matchesAny(msgLower, crudContextKeywords)) {
        return 'CRUD';
      }
      // 或者匹配明确的 CRUD 操作模式（如"delete trip"、"create order"）
      const englishCrudPatterns = [
        /(?:delete|remove|drop).*(?:trip|order|record|data|item)/i,
        /(?:create|add|insert|new).*(?:trip|order|record|data|item)/i,
        /(?:update|modify|edit|change).*(?:trip|order|record|data|item)/i,
      ];
      if (englishCrudPatterns.some(pattern => pattern.test(msg))) {
        return 'CRUD';
      }
    }
    
    // 检查中文 CRUD 模式（更严格的匹配）
    const chineseCrudPatterns = [
      // 模式1: "删除/创建/更新 + 对象"（动作词在前）
      /(?:删除|创建|更新|新增|修改|编辑).*(?:行程|订单|记录|数据|项目|条目|文档|文件|信息|资料)/,
      // 模式2: "对象 + 删除/创建/更新"（对象在前）
      /(?:行程|订单|记录|数据|项目|条目|文档|文件|信息|资料).*(?:删除|创建|更新|新增|修改|编辑)/,
      // 模式3: 明确的 CRUD 操作短语
      /(?:删除行程|创建订单|更新记录|新增数据|修改项目|编辑文档)/,
    ];
    
    if (chineseCrudPatterns.some(pattern => pattern.test(msg))) {
      return 'CRUD';
    }
    
    // 检查是否包含 CRUD 动作词和对象上下文（但不在同一短语中）
    // 这种情况需要更严格的检查，避免误判
    const hasCrudAction = matchesAny(msg, chineseCrudActions) || matchesAny(msgLower, englishCrudActions);
    const hasContext = matchesAny(msg, crudContextKeywords) || matchesAny(msgLower, crudContextKeywords);
    
    if (hasCrudAction && hasContext) {
      // 检查动作词和对象是否在合理距离内（避免"我想删除烦恼，但订单还在"这样的误判）
      // 简单检查：如果消息长度较短（< 50字符），且同时包含动作词和对象，可能是 CRUD
      if (msg.length < 50) {
        return 'CRUD';
      }
      // 对于长消息，需要更严格的模式匹配（已在上面处理）
    }
  }

  // 处理完 CRUD 后继续其他类型判断
  // Data lookup / info retrieval
  if (matchesAny(msg, ['查一下', '查询', '看看', '多少', '是什么', '列出', '给我数据'])) {
    return 'DATA_LOOKUP';
  }

  // Customer support-ish
  if (matchesAny(msg, ['退款', '投诉', '无法登录', '打不开', '报错', '无法支付', '账号', '订单'])) {
    return 'CUSTOMER_SUPPORT';
  }

  // RAG/QA hints
  if (matchesAny(msgLower, ['according to', 'based on the document', 'summarize', '总结', '概括', '文档'])) {
    return 'RAG_QA';
  }

  // Booking workflow hints (even without trip_id)
  if (matchesAny(msg, ['预订', '订票', '订酒店', '下单', '支付', 'booking', 'reserve'])) {
    return 'BOOKING_WORKFLOW';
  }

  // Default
  return 'GENERIC_QA';
}

/**
 * 推断复杂度
 */
function inferComplexity(msg: string, recentCount: number): ComplexityLevel {
  const len = msg.length;
  const multiClause = matchesAny(msg, ['并且', '同时', '然后', '之后', '再', '另外', '对比', '比较', '优缺点', '方案', '步骤']);
  const manyQuestions = (msg.match(/[?？]/g)?.length ?? 0) >= 2;

  if (len >= 400 || (len >= 220 && (multiClause || manyQuestions)) || recentCount >= 8) return 'COMPLEX';
  if (len >= 120 || multiClause || recentCount >= 4) return 'MODERATE';
  return 'SIMPLE';
}

/**
 * 推断是否需要工具调用
 */
function inferExpectsToolCalls(
  taskType: TaskType,
  msg: string,
  msgLower: string,
  allowWebbrowse?: boolean,
): boolean {
  // If webbrowse is allowed and the user asks for latest/current/prices/weather, tools are likely.
  const timeSensitive =
    matchesAny(msg, ['最新', '今天', '当前', '实时', '现在', '最近']) ||
    matchesAny(msgLower, ['latest', 'today', 'current', 'realtime', 'now']);

  const travelSignals = matchesAny(msg, ['路线', '交通', '地铁', '公交', '打车', '步行', '景点', '开放时间', '门票', '酒店']);
  const compareSignals = matchesAny(msg, ['对比', '比较', '哪个好', '推荐', '排行']);

  if (taskType === 'TRIP_PLANNING' || taskType === 'BOOKING_WORKFLOW') return true;
  if (timeSensitive && allowWebbrowse) return true;
  if (travelSignals || compareSignals) return true;

  // RAG_QA might be internal retrieval; treat as tool-y but not necessarily web.
  if (taskType === 'RAG_QA') return true;

  return false;
}

/**
 * 推断是否需要结构化输出
 */
function inferRequiresStructuredOutput(taskType: TaskType, tripId: string | null | undefined): boolean {
  if (tripId) return true;
  return taskType === 'TRIP_PLANNING' || taskType === 'BOOKING_WORKFLOW';
}

/**
 * 推断是否需要审计
 */
function inferNeedsAudit(taskType: TaskType, requiresStructuredOutput: boolean, options: any): boolean {
  // Conservative defaults: audited flows for structured multi-step tasks.
  if (options.dry_run) return false; // treat dry_run as dev/test; still trace everything, just not "audit required"
  if (requiresStructuredOutput) return true;
  if (taskType === 'BOOKING_WORKFLOW') return true;
  return false;
}

/**
 * 推断风险级别
 */
function inferRisk(taskType: TaskType, msg: string, msgLower: string): RiskLevel {
  // CRITICAL triggers: 必须是明确的金融操作或敏感数据处理，而不是仅仅提到这些词汇
  // 例如"提到护照" ≠ CRITICAL，"帮我填写/提交/处理护照信息" = CRITICAL
  
  // 支付相关：必须是明确的支付操作
  const paymentActionPatterns = [
    /(?:支付|付款|转账|下单|付款|pay|transfer|purchase).*(?:金额|钱|费用|元|美元|美元)/i,
    /(?:信用卡|银行卡).*(?:号码|卡号|信息|信息)/i,
    /cvv|cvc|cvn/i, // 信用卡安全码
  ];
  const payment = paymentActionPatterns.some(pattern => pattern.test(msg));
  
  // PII 相关：必须是明确的 PII 处理操作，而不是仅仅查询
  // 修复：使用更宽松的模式匹配，确保能匹配"帮我填写护照信息"这样的句子
  // 关键：必须同时包含动作词（填写/提交等）和敏感信息（护照/身份证等）
  const piiActionPatterns = [
    // 模式1: "帮我填写护照号码" - 包含"帮我" + 动作 + 敏感信息
    /(?:帮|请|帮我).*(?:填写|提交|处理|录入|输入|提供).*(?:身份证|护照|住址|手机号|邮箱|姓名|个人信息)/i,
    // 模式2: "填写护照号码" - 直接动作 + 敏感信息
    /(?:填写|提交|处理|录入|输入|提供).*(?:身份证|护照|住址|手机号|邮箱|姓名|个人信息)/i,
    // 模式3: "填写passport信息" - 英文敏感信息
    /(?:填写|提交|处理|录入|输入|提供).*(?:passport|ssn|credit card|personal information)/i,
    // 模式4: "护照号码填写" - 敏感信息在前
    /(?:身份证|护照).*(?:号码|信息|信息).*(?:填写|提交|处理)/i,
    // 模式5: 更通用的模式 - 包含动作词和敏感信息（顺序灵活）
    /(?:身份证|护照|住址|手机号|邮箱|姓名).*(?:填写|提交|处理|录入|输入|提供)/i,
  ];
  const piiAction = piiActionPatterns.some(pattern => pattern.test(msg));
  
  // 仅提到但不涉及操作（降低风险等级）
  const piiMentionOnly = matchesAny(msg, ['身份证', '护照', '住址', '手机号', '邮箱', '姓名']) ||
    matchesAny(msgLower, ['passport', 'ssn', 'credit card']);
  const piiQueryPatterns = [
    /(?:需要|要带|要准备|需要准备).*(?:护照|身份证)/i,
    /(?:护照|身份证).*(?:要带|需要|准备)/i,
  ];
  const piiQueryOnly = piiQueryPatterns.some(pattern => pattern.test(msg));
  
  // CRITICAL: 明确的支付或 PII 操作
  // 修复：只要匹配到 piiAction，就应该是 CRITICAL（无论 taskType）
  if (payment) {
    return 'CRITICAL';
  }
  
  if (piiAction) {
    return 'CRITICAL'; // 明确的 PII 操作总是 CRITICAL
  }
  
  // HIGH: 医疗法律或 PII 查询（但非操作）
  const medicalLegal = matchesAny(msg, ['诊断', '用药', '律师', '起诉', '合同', '犯罪']);
  if (medicalLegal) return 'HIGH';
  
  // 仅提到 PII 但无操作，降级到 MEDIUM
  if (piiMentionOnly && !piiAction && !piiQueryOnly) {
    // 提到但不操作，可能是正常咨询
    return taskType === 'BOOKING_WORKFLOW' ? 'MEDIUM' : 'LOW';
  }
  
  // 查询 PII 但不操作，MEDIUM
  if (piiQueryOnly) {
    return 'MEDIUM';
  }

  if (taskType === 'BOOKING_WORKFLOW') return 'HIGH';
  if (taskType === 'TRIP_PLANNING') return 'MEDIUM';
  if (taskType === 'CUSTOMER_SUPPORT') return 'MEDIUM';

  return 'LOW';
}

/**
 * 推断 Legacy 是否良好支持
 */
function inferLegacyWellSupported(taskType: TaskType, complexity: ComplexityLevel): boolean {
  if (taskType === 'CRUD' || taskType === 'DATA_LOOKUP') return true;
  if (taskType === 'RAG_QA' && complexity !== 'COMPLEX') return true;

  // Trip/booking typically benefit from skills + gated planning.
  if (taskType === 'TRIP_PLANNING' || taskType === 'BOOKING_WORKFLOW') return false;

  // Default: moderate confidence legacy support
  return complexity === 'SIMPLE';
}

/**
 * 辅助函数：检查字符串是否包含任一模式
 */
function matchesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * 辅助函数：将数字限制在指定范围内
 */
function clampInt(n: number, min: number, max: number): number {
  const x = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.max(min, Math.min(max, x));
}
