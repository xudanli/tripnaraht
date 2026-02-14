"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_ENUM_OPTIONS = exports.SORT_ORDER_OPTIONS = exports.TREND_TYPE_OPTIONS = exports.INCIDENT_TYPE_OPTIONS = exports.RISK_TYPE_OPTIONS = exports.VISUALIZATION_TYPE_OPTIONS = exports.DECISION_RESULT_OPTIONS = exports.CONSTRAINT_ACTION_OPTIONS = exports.RISK_EVENT_STATUS_OPTIONS = exports.EXECUTABILITY_OPTIONS = exports.DANGER_LEVEL_OPTIONS = exports.TIME_RANGE_OPTIONS = exports.SEASON_OPTIONS = exports.LANGUAGE_OPTIONS = exports.EVIDENCE_TYPE_OPTIONS = exports.DECISION_TYPE_OPTIONS = exports.USER_ACTION_TYPE_OPTIONS = exports.CONSTRAINT_SEVERITY_OPTIONS = exports.CONSTRAINT_TYPE_OPTIONS = exports.RISK_HANDLE_ACTION_OPTIONS = exports.RISK_CATEGORY_OPTIONS = exports.SEV_LEVEL_OPTIONS = exports.TRAINING_TYPE_OPTIONS = exports.TRAINING_STATUS_OPTIONS = exports.BASE_MODEL_OPTIONS = exports.MODEL_TYPE_OPTIONS = void 0;
exports.MODEL_TYPE_OPTIONS = [
    { value: 'SFT', label: 'SFT (Supervised Fine-Tuning)', labelZh: 'SFT (监督微调)', description: 'Basic task learning through supervised training', descriptionZh: '监督微调，适用于基础任务学习' },
    { value: 'RLHF', label: 'RLHF (RL from Human Feedback)', labelZh: 'RLHF (人类反馈强化学习)', description: 'Reinforcement learning with human feedback for alignment', descriptionZh: '人类反馈强化学习，提升对齐能力' },
    { value: 'RL', label: 'RL (Reinforcement Learning)', labelZh: 'RL (强化学习)', description: 'Pure reinforcement learning based on reward signals', descriptionZh: '纯强化学习，基于奖励信号优化' },
    { value: 'DPO', label: 'DPO (Direct Preference Optimization)', labelZh: 'DPO (直接偏好优化)', description: 'Simplified RLHF process with direct preference optimization', descriptionZh: '直接偏好优化，简化RLHF流程' },
    { value: 'PPO', label: 'PPO (Proximal Policy Optimization)', labelZh: 'PPO (近端策略优化)', description: 'Stable training with proximal policy optimization', descriptionZh: '近端策略优化，稳定训练' },
];
exports.BASE_MODEL_OPTIONS = [
    { value: 'claude-3-opus', label: 'Claude 3 Opus', provider: 'Anthropic' },
    { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', provider: 'Anthropic' },
    { value: 'claude-3-haiku', label: 'Claude 3 Haiku', provider: 'Anthropic' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', provider: 'OpenAI' },
    { value: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'OpenAI' },
    { value: 'llama-3-70b', label: 'Llama 3 70B', provider: 'Meta' },
    { value: 'llama-3-8b', label: 'Llama 3 8B', provider: 'Meta' },
    { value: 'mistral-large', label: 'Mistral Large', provider: 'Mistral' },
    { value: 'mistral-medium', label: 'Mistral Medium', provider: 'Mistral' },
    { value: 'qwen-72b', label: 'Qwen 72B', provider: 'Alibaba' },
    { value: 'deepseek-v2', label: 'DeepSeek V2', provider: 'DeepSeek' },
    { value: 'custom', label: 'Custom Model', labelZh: '自定义模型', provider: 'Custom' },
];
exports.TRAINING_STATUS_OPTIONS = [
    { value: 'PENDING', label: 'Pending', labelZh: '等待中', color: 'gray' },
    { value: 'RUNNING', label: 'Running', labelZh: '运行中', color: 'blue' },
    { value: 'COMPLETED', label: 'Completed', labelZh: '已完成', color: 'green' },
    { value: 'FAILED', label: 'Failed', labelZh: '失败', color: 'red' },
    { value: 'CANCELLED', label: 'Cancelled', labelZh: '已取消', color: 'orange' },
];
exports.TRAINING_TYPE_OPTIONS = [
    { value: 'PREFERENCE_COMPARISON', label: 'Preference Comparison', labelZh: '偏好对比', description: 'Train by comparing preferences between outputs', descriptionZh: '通过对比输出的偏好进行训练' },
    { value: 'SCORE_REGRESSION', label: 'Score Regression', labelZh: '分数回归', description: 'Train to predict quality scores directly', descriptionZh: '直接预测质量分数进行训练' },
];
exports.SEV_LEVEL_OPTIONS = [
    { value: 'SEV-1', label: 'SEV-1 (Critical)', labelZh: 'SEV-1 (严重)', color: 'red', description: 'Critical - Immediate action required', descriptionZh: '严重 - 需要立即处理' },
    { value: 'SEV-2', label: 'SEV-2 (High)', labelZh: 'SEV-2 (高)', color: 'orange', description: 'High priority - Action within hours', descriptionZh: '高优先级 - 数小时内处理' },
    { value: 'SEV-3', label: 'SEV-3 (Medium)', labelZh: 'SEV-3 (中)', color: 'yellow', description: 'Medium priority - Action within days', descriptionZh: '中优先级 - 数天内处理' },
    { value: 'SEV-4', label: 'SEV-4 (Low)', labelZh: 'SEV-4 (低)', color: 'green', description: 'Low priority - Routine handling', descriptionZh: '低优先级 - 常规处理' },
];
exports.RISK_CATEGORY_OPTIONS = [
    { value: 'SAFETY', label: 'Safety', labelZh: '安全', icon: 'shield', description: 'Physical safety risks', descriptionZh: '人身安全风险' },
    { value: 'LEGAL', label: 'Legal', labelZh: '法律', icon: 'gavel', description: 'Legal compliance risks', descriptionZh: '法律合规风险' },
    { value: 'HEALTH', label: 'Health', labelZh: '健康', icon: 'heart', description: 'Health-related risks', descriptionZh: '健康相关风险' },
    { value: 'FINANCIAL', label: 'Financial', labelZh: '财务', icon: 'dollar', description: 'Financial loss risks', descriptionZh: '财务损失风险' },
    { value: 'LOGISTICS', label: 'Logistics', labelZh: '后勤', icon: 'truck', description: 'Logistics and operational risks', descriptionZh: '后勤与运营风险' },
    { value: 'WEATHER', label: 'Weather', labelZh: '天气', icon: 'cloud', description: 'Weather-related risks', descriptionZh: '天气相关风险' },
];
exports.RISK_HANDLE_ACTION_OPTIONS = [
    { value: 'APPROVE', label: 'Approve', labelZh: '批准', color: 'green', description: 'Approve and proceed', descriptionZh: '批准并继续' },
    { value: 'REJECT', label: 'Reject', labelZh: '拒绝', color: 'red', description: 'Reject and stop', descriptionZh: '拒绝并停止' },
    { value: 'MITIGATE', label: 'Mitigate', labelZh: '缓解', color: 'orange', description: 'Apply mitigation measures', descriptionZh: '采取缓解措施' },
];
exports.CONSTRAINT_TYPE_OPTIONS = [
    { value: 'GEOGRAPHIC', label: 'Geographic', labelZh: '地理', description: 'Location-based constraints', descriptionZh: '基于位置的约束' },
    { value: 'TEMPORAL', label: 'Temporal', labelZh: '时间', description: 'Time-based constraints', descriptionZh: '基于时间的约束' },
    { value: 'COMPLIANCE', label: 'Compliance', labelZh: '合规', description: 'Regulatory compliance constraints', descriptionZh: '法规合规约束' },
    { value: 'USER_PREFERENCE', label: 'User Preference', labelZh: '用户偏好', description: 'User preference constraints', descriptionZh: '用户偏好约束' },
];
exports.CONSTRAINT_SEVERITY_OPTIONS = [
    { value: 'HARD', label: 'Hard', labelZh: '硬约束', color: 'red', description: 'Must be satisfied, no exceptions', descriptionZh: '必须满足，不可违反' },
    { value: 'SOFT', label: 'Soft', labelZh: '软约束', color: 'yellow', description: 'Should be satisfied, but can be relaxed', descriptionZh: '应该满足，但可放宽' },
];
exports.USER_ACTION_TYPE_OPTIONS = [
    { value: 'ADOPT', label: 'Adopt', labelZh: '采纳', icon: 'check', description: 'User adopted the recommendation', descriptionZh: '用户采纳了推荐' },
    { value: 'EDIT', label: 'Edit', labelZh: '编辑', icon: 'edit', description: 'User modified the recommendation', descriptionZh: '用户修改了推荐' },
    { value: 'EXPORT', label: 'Export', labelZh: '导出', icon: 'download', description: 'User exported the plan', descriptionZh: '用户导出了计划' },
    { value: 'ABANDON', label: 'Abandon', labelZh: '放弃', icon: 'close', description: 'User abandoned the plan', descriptionZh: '用户放弃了计划' },
    { value: 'FEEDBACK', label: 'Feedback', labelZh: '反馈', icon: 'message', description: 'User provided feedback', descriptionZh: '用户提供了反馈' },
];
exports.DECISION_TYPE_OPTIONS = [
    { value: 'PLAN_GENERATION', label: 'Plan Generation', labelZh: '计划生成' },
    { value: 'ROUTE_SELECTION', label: 'Route Selection', labelZh: '路线选择' },
    { value: 'POI_RECOMMENDATION', label: 'POI Recommendation', labelZh: 'POI推荐' },
    { value: 'CONSTRAINT_CHECK', label: 'Constraint Check', labelZh: '约束检查' },
    { value: 'RISK_ASSESSMENT', label: 'Risk Assessment', labelZh: '风险评估' },
    { value: 'USER_CLARIFICATION', label: 'User Clarification', labelZh: '用户澄清' },
];
exports.EVIDENCE_TYPE_OPTIONS = [
    { value: 'GATE_RESULT', label: 'Gate Result', labelZh: '门控结果' },
    { value: 'COMPLIANCE_CHECK', label: 'Compliance Check', labelZh: '合规检查' },
    { value: 'CONSTRAINT_CHECK', label: 'Constraint Check', labelZh: '约束检查' },
    { value: 'USER_APPROVAL', label: 'User Approval', labelZh: '用户批准' },
    { value: 'MODEL_DECISION', label: 'Model Decision', labelZh: '模型决策' },
    { value: 'RESEARCH_DATA', label: 'Research Data', labelZh: '研究数据' },
    { value: 'USER_FEEDBACK', label: 'User Feedback', labelZh: '用户反馈' },
];
exports.LANGUAGE_OPTIONS = [
    { value: 'en', label: 'English', labelZh: '英语' },
    { value: 'zh', label: '中文', labelZh: '中文' },
];
exports.SEASON_OPTIONS = [
    { value: 'SPRING', label: 'Spring', labelZh: '春季', months: [3, 4, 5] },
    { value: 'SUMMER', label: 'Summer', labelZh: '夏季', months: [6, 7, 8] },
    { value: 'AUTUMN', label: 'Autumn', labelZh: '秋季', months: [9, 10, 11] },
    { value: 'WINTER', label: 'Winter', labelZh: '冬季', months: [12, 1, 2] },
];
exports.TIME_RANGE_OPTIONS = [
    { value: 'TODAY', label: 'Today', labelZh: '今天' },
    { value: 'WEEK', label: 'This Week', labelZh: '本周' },
    { value: 'MONTH', label: 'This Month', labelZh: '本月' },
    { value: 'QUARTER', label: 'This Quarter', labelZh: '本季度' },
    { value: 'YEAR', label: 'This Year', labelZh: '今年' },
    { value: 'CUSTOM', label: 'Custom Range', labelZh: '自定义' },
];
exports.DANGER_LEVEL_OPTIONS = [
    { value: 'LOW', label: 'Low', labelZh: '低', color: 'green' },
    { value: 'MEDIUM', label: 'Medium', labelZh: '中', color: 'yellow' },
    { value: 'HIGH', label: 'High', labelZh: '高', color: 'orange' },
    { value: 'CRITICAL', label: 'Critical', labelZh: '严重', color: 'red' },
];
exports.EXECUTABILITY_OPTIONS = [
    { value: 'EXECUTABLE', label: 'Executable', labelZh: '可执行', color: 'green' },
    { value: 'PARTIALLY_EXECUTABLE', label: 'Partially Executable', labelZh: '部分可执行', color: 'yellow' },
    { value: 'NOT_EXECUTABLE', label: 'Not Executable', labelZh: '不可执行', color: 'red' },
];
exports.RISK_EVENT_STATUS_OPTIONS = [
    { value: 'PENDING', label: 'Pending', labelZh: '待处理', color: 'gray' },
    { value: 'APPROVED', label: 'Approved', labelZh: '已批准', color: 'green' },
    { value: 'REJECTED', label: 'Rejected', labelZh: '已拒绝', color: 'red' },
    { value: 'MITIGATED', label: 'Mitigated', labelZh: '已缓解', color: 'orange' },
];
exports.CONSTRAINT_ACTION_OPTIONS = [
    { value: 'BLOCK', label: 'Block', labelZh: '阻止', color: 'red' },
    { value: 'WARN', label: 'Warn', labelZh: '警告', color: 'yellow' },
    { value: 'REQUIRE_APPROVAL', label: 'Require Approval', labelZh: '需要批准', color: 'orange' },
];
exports.DECISION_RESULT_OPTIONS = [
    { value: 'APPROVED', label: 'Approved', labelZh: '已批准', color: 'green' },
    { value: 'REJECTED', label: 'Rejected', labelZh: '已拒绝', color: 'red' },
    { value: 'MODIFIED', label: 'Modified', labelZh: '已修改', color: 'blue' },
    { value: 'PENDING_APPROVAL', label: 'Pending Approval', labelZh: '待批准', color: 'yellow' },
];
exports.VISUALIZATION_TYPE_OPTIONS = [
    { value: 'DECISION_TREE', label: 'Decision Tree', labelZh: '决策树' },
    { value: 'EVIDENCE_GRAPH', label: 'Evidence Graph', labelZh: '证据图' },
    { value: 'TIMELINE', label: 'Timeline', labelZh: '时间线' },
];
exports.RISK_TYPE_OPTIONS = [
    { value: 'WEATHER', label: 'Weather', labelZh: '天气风险' },
    { value: 'SAFETY', label: 'Safety', labelZh: '安全风险' },
    { value: 'ACCESSIBILITY', label: 'Accessibility', labelZh: '可达性风险' },
];
exports.INCIDENT_TYPE_OPTIONS = [
    { value: 'ROUTE_BLOCKED', label: 'Route Blocked', labelZh: '路线被阻止' },
    { value: 'WEATHER_HAZARD', label: 'Weather Hazard', labelZh: '天气危险' },
    { value: 'SAFETY_CONCERN', label: 'Safety Concern', labelZh: '安全担忧' },
    { value: 'LEGAL_ISSUE', label: 'Legal Issue', labelZh: '法律问题' },
    { value: 'RESOURCE_UNAVAILABLE', label: 'Resource Unavailable', labelZh: '资源不可用' },
];
exports.TREND_TYPE_OPTIONS = [
    { value: 'INCREASING', label: 'Increasing', labelZh: '上升', color: 'green' },
    { value: 'DECREASING', label: 'Decreasing', labelZh: '下降', color: 'red' },
    { value: 'STABLE', label: 'Stable', labelZh: '稳定', color: 'gray' },
];
exports.SORT_ORDER_OPTIONS = [
    { value: 'ASC', label: 'Ascending', labelZh: '升序' },
    { value: 'DESC', label: 'Descending', labelZh: '降序' },
];
exports.ALL_ENUM_OPTIONS = {
    modelType: exports.MODEL_TYPE_OPTIONS,
    baseModel: exports.BASE_MODEL_OPTIONS,
    trainingStatus: exports.TRAINING_STATUS_OPTIONS,
    trainingType: exports.TRAINING_TYPE_OPTIONS,
    sevLevel: exports.SEV_LEVEL_OPTIONS,
    riskCategory: exports.RISK_CATEGORY_OPTIONS,
    riskHandleAction: exports.RISK_HANDLE_ACTION_OPTIONS,
    riskEventStatus: exports.RISK_EVENT_STATUS_OPTIONS,
    constraintType: exports.CONSTRAINT_TYPE_OPTIONS,
    constraintSeverity: exports.CONSTRAINT_SEVERITY_OPTIONS,
    constraintAction: exports.CONSTRAINT_ACTION_OPTIONS,
    userActionType: exports.USER_ACTION_TYPE_OPTIONS,
    decisionType: exports.DECISION_TYPE_OPTIONS,
    decisionResult: exports.DECISION_RESULT_OPTIONS,
    evidenceType: exports.EVIDENCE_TYPE_OPTIONS,
    visualizationType: exports.VISUALIZATION_TYPE_OPTIONS,
    language: exports.LANGUAGE_OPTIONS,
    season: exports.SEASON_OPTIONS,
    timeRange: exports.TIME_RANGE_OPTIONS,
    dangerLevel: exports.DANGER_LEVEL_OPTIONS,
    executability: exports.EXECUTABILITY_OPTIONS,
    riskType: exports.RISK_TYPE_OPTIONS,
    incidentType: exports.INCIDENT_TYPE_OPTIONS,
    trendType: exports.TREND_TYPE_OPTIONS,
    sortOrder: exports.SORT_ORDER_OPTIONS,
};
//# sourceMappingURL=enums.interface.js.map