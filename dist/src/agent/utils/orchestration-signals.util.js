"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signalsFromRequest = signalsFromRequest;
const DEFAULT_MAX_SECONDS = 60;
function signalsFromRequest(req) {
    var _a, _b, _c, _d, _e, _f;
    const msg = ((_a = req.message) !== null && _a !== void 0 ? _a : '').trim();
    const msgLower = msg.toLowerCase();
    const options = (_b = req.options) !== null && _b !== void 0 ? _b : {};
    const ctx = (_c = req.conversation_context) !== null && _c !== void 0 ? _c : {};
    const recentCount = (_e = (_d = ctx.recent_messages) === null || _d === void 0 ? void 0 : _d.length) !== null && _e !== void 0 ? _e : 0;
    const latencyBudgetMs = clampInt(((_f = options.max_seconds) !== null && _f !== void 0 ? _f : DEFAULT_MAX_SECONDS) * 1000, 0, 5 * 60000);
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
function inferTaskType(tripId, msg, msgLower) {
    if (tripId)
        return 'TRIP_PLANNING';
    const englishCrudActions = ['create ', 'update ', 'delete ', 'insert ', 'upsert ', 'patch ', 'put ', 'post '];
    const chineseCrudActions = ['新增', '创建', '更新', '删除', '改一下', '写入', '保存', '修改', '编辑'];
    const crudContextKeywords = [
        'record', 'order', 'trip', 'data', 'item', 'entry', 'row', 'document', 'file',
        '行程', '订单', '记录', '数据', '项目', '条目', '文档', '文件', '信息', '资料',
    ];
    const falsePositivePatterns = [
        /(?:删除|delete).*(?:烦恼|烦恼|压力|焦虑|悲伤|痛苦|困难|问题|困扰)/i,
        /(?:创建|create).*(?:快乐|幸福|美好|梦想|希望|未来|回忆)/i,
        /(?:更新|update).*(?:心情|情绪|状态|感觉|感受)/i,
    ];
    if (falsePositivePatterns.some(pattern => pattern.test(msg))) {
    }
    else {
        if (matchesAny(msgLower, englishCrudActions)) {
            if (matchesAny(msgLower, crudContextKeywords)) {
                return 'CRUD';
            }
            const englishCrudPatterns = [
                /(?:delete|remove|drop).*(?:trip|order|record|data|item)/i,
                /(?:create|add|insert|new).*(?:trip|order|record|data|item)/i,
                /(?:update|modify|edit|change).*(?:trip|order|record|data|item)/i,
            ];
            if (englishCrudPatterns.some(pattern => pattern.test(msg))) {
                return 'CRUD';
            }
        }
        const chineseCrudPatterns = [
            /(?:删除|创建|更新|新增|修改|编辑).*(?:行程|订单|记录|数据|项目|条目|文档|文件|信息|资料)/,
            /(?:行程|订单|记录|数据|项目|条目|文档|文件|信息|资料).*(?:删除|创建|更新|新增|修改|编辑)/,
            /(?:删除行程|创建订单|更新记录|新增数据|修改项目|编辑文档)/,
        ];
        if (chineseCrudPatterns.some(pattern => pattern.test(msg))) {
            return 'CRUD';
        }
        const hasCrudAction = matchesAny(msg, chineseCrudActions) || matchesAny(msgLower, englishCrudActions);
        const hasContext = matchesAny(msg, crudContextKeywords) || matchesAny(msgLower, crudContextKeywords);
        if (hasCrudAction && hasContext) {
            if (msg.length < 50) {
                return 'CRUD';
            }
        }
    }
    if (matchesAny(msg, ['查一下', '查询', '看看', '多少', '是什么', '列出', '给我数据'])) {
        return 'DATA_LOOKUP';
    }
    if (matchesAny(msg, ['退款', '投诉', '无法登录', '打不开', '报错', '无法支付', '账号', '订单'])) {
        return 'CUSTOMER_SUPPORT';
    }
    if (matchesAny(msgLower, ['according to', 'based on the document', 'summarize', '总结', '概括', '文档'])) {
        return 'RAG_QA';
    }
    if (matchesAny(msg, ['预订', '订票', '订酒店', '下单', '支付', 'booking', 'reserve'])) {
        return 'BOOKING_WORKFLOW';
    }
    return 'GENERIC_QA';
}
function inferComplexity(msg, recentCount) {
    var _a, _b;
    const len = msg.length;
    const multiClause = matchesAny(msg, ['并且', '同时', '然后', '之后', '再', '另外', '对比', '比较', '优缺点', '方案', '步骤']);
    const manyQuestions = ((_b = (_a = msg.match(/[?？]/g)) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) >= 2;
    if (len >= 400 || (len >= 220 && (multiClause || manyQuestions)) || recentCount >= 8)
        return 'COMPLEX';
    if (len >= 120 || multiClause || recentCount >= 4)
        return 'MODERATE';
    return 'SIMPLE';
}
function inferExpectsToolCalls(taskType, msg, msgLower, allowWebbrowse) {
    const timeSensitive = matchesAny(msg, ['最新', '今天', '当前', '实时', '现在', '最近']) ||
        matchesAny(msgLower, ['latest', 'today', 'current', 'realtime', 'now']);
    const travelSignals = matchesAny(msg, ['路线', '交通', '地铁', '公交', '打车', '步行', '景点', '开放时间', '门票', '酒店']);
    const compareSignals = matchesAny(msg, ['对比', '比较', '哪个好', '推荐', '排行']);
    if (taskType === 'TRIP_PLANNING' || taskType === 'BOOKING_WORKFLOW')
        return true;
    if (timeSensitive && allowWebbrowse)
        return true;
    if (travelSignals || compareSignals)
        return true;
    if (taskType === 'RAG_QA')
        return true;
    return false;
}
function inferRequiresStructuredOutput(taskType, tripId) {
    if (tripId)
        return true;
    return taskType === 'TRIP_PLANNING' || taskType === 'BOOKING_WORKFLOW';
}
function inferNeedsAudit(taskType, requiresStructuredOutput, options) {
    if (options.dry_run)
        return false;
    if (requiresStructuredOutput)
        return true;
    if (taskType === 'BOOKING_WORKFLOW')
        return true;
    return false;
}
function inferRisk(taskType, msg, msgLower) {
    const paymentActionPatterns = [
        /(?:支付|付款|转账|下单|付款|pay|transfer|purchase).*(?:金额|钱|费用|元|美元|美元)/i,
        /(?:信用卡|银行卡).*(?:号码|卡号|信息|信息)/i,
        /cvv|cvc|cvn/i,
    ];
    const payment = paymentActionPatterns.some(pattern => pattern.test(msg));
    const piiActionPatterns = [
        /(?:帮|请|帮我).*(?:填写|提交|处理|录入|输入|提供).*(?:身份证|护照|住址|手机号|邮箱|姓名|个人信息)/i,
        /(?:填写|提交|处理|录入|输入|提供).*(?:身份证|护照|住址|手机号|邮箱|姓名|个人信息)/i,
        /(?:填写|提交|处理|录入|输入|提供).*(?:passport|ssn|credit card|personal information)/i,
        /(?:身份证|护照).*(?:号码|信息|信息).*(?:填写|提交|处理)/i,
        /(?:身份证|护照|住址|手机号|邮箱|姓名).*(?:填写|提交|处理|录入|输入|提供)/i,
    ];
    const piiAction = piiActionPatterns.some(pattern => pattern.test(msg));
    const piiMentionOnly = matchesAny(msg, ['身份证', '护照', '住址', '手机号', '邮箱', '姓名']) ||
        matchesAny(msgLower, ['passport', 'ssn', 'credit card']);
    const piiQueryPatterns = [
        /(?:需要|要带|要准备|需要准备).*(?:护照|身份证)/i,
        /(?:护照|身份证).*(?:要带|需要|准备)/i,
    ];
    const piiQueryOnly = piiQueryPatterns.some(pattern => pattern.test(msg));
    if (payment) {
        return 'CRITICAL';
    }
    if (piiAction) {
        return 'CRITICAL';
    }
    const medicalLegal = matchesAny(msg, ['诊断', '用药', '律师', '起诉', '合同', '犯罪']);
    if (medicalLegal)
        return 'HIGH';
    if (piiMentionOnly && !piiAction && !piiQueryOnly) {
        return taskType === 'BOOKING_WORKFLOW' ? 'MEDIUM' : 'LOW';
    }
    if (piiQueryOnly) {
        return 'MEDIUM';
    }
    if (taskType === 'BOOKING_WORKFLOW')
        return 'HIGH';
    if (taskType === 'TRIP_PLANNING')
        return 'MEDIUM';
    if (taskType === 'CUSTOMER_SUPPORT')
        return 'MEDIUM';
    return 'LOW';
}
function inferLegacyWellSupported(taskType, complexity) {
    if (taskType === 'CRUD' || taskType === 'DATA_LOOKUP')
        return true;
    if (taskType === 'RAG_QA' && complexity !== 'COMPLEX')
        return true;
    if (taskType === 'TRIP_PLANNING' || taskType === 'BOOKING_WORKFLOW')
        return false;
    return complexity === 'SIMPLE';
}
function matchesAny(haystack, needles) {
    return needles.some((n) => haystack.includes(n));
}
function clampInt(n, min, max) {
    const x = Number.isFinite(n) ? Math.floor(n) : min;
    return Math.max(min, Math.min(max, x));
}
//# sourceMappingURL=orchestration-signals.util.js.map