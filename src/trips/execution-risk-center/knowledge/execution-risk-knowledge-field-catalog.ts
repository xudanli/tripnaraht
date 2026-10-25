/**
 * Admin UI 字段目录：与研究报告表格列对齐，含中文含义。
 * status: shipped = API 已返回；derived = 由已有字段推导；planned = P2 扩展列（现返回 null）
 */

export type FieldStatus = 'shipped' | 'derived' | 'planned';

export interface KnowledgeFieldDesc {
  /** API / 研究表字段名 */
  field: string;
  /** 中文名称 */
  labelZh: string;
  /** 含义说明 */
  meaningZh: string;
  /** 类型提示 */
  type: string;
  /** 示例 */
  example?: string;
  status: FieldStatus;
  /** 研究表列名（若与 API 不同） */
  researchColumn?: string;
}

export const DEFINITION_FIELDS: KnowledgeFieldDesc[] = [
  {
    field: 'riskCode',
    labelZh: '风险编码',
    meaningZh: '风险条目唯一业务编码（等同 knowledgeCode）',
    type: 'string',
    example: 'ENV-WIND-01',
    status: 'derived',
    researchColumn: 'riskCode',
  },
  {
    field: 'knowledgeCode',
    labelZh: '知识编码',
    meaningZh: '知识库主键编码，跨系统引用用此字段',
    type: 'string',
    example: 'ENV-WIND-01',
    status: 'shipped',
  },
  {
    field: 'canonicalCode',
    labelZh: '规范编码',
    meaningZh: '对外稳定规范码（API/运行时常用），可一对多映射知识编码',
    type: 'string',
    example: 'WEATHER_STRONG_WIND',
    status: 'shipped',
  },
  {
    field: 'riskType',
    labelZh: '风险大类',
    meaningZh: '风险所属域：环境/道路/成员状态/行程执行/日程/预订/团队/资源',
    type: 'string',
    example: 'ENVIRONMENT',
    status: 'shipped',
    researchColumn: 'riskType',
  },
  {
    field: 'subCategory',
    labelZh: '子类目',
    meaningZh: '大类下的细分（如风、降水、水文、地质）',
    type: 'string',
    example: '风',
    status: 'planned',
    researchColumn: 'subCategory',
  },
  {
    field: 'itemName',
    labelZh: '风险项名称',
    meaningZh: '面向运营/用户的短名称（优先中文）',
    type: 'string',
    example: '强风',
    status: 'derived',
    researchColumn: 'itemName',
  },
  {
    field: 'displayName',
    labelZh: '多语言显示名',
    meaningZh: '结构化多语言名称，后台编辑用',
    type: 'object',
    example: '{ "zh": "强风", "en": "Strong Wind" }',
    status: 'shipped',
  },
  {
    field: 'definition',
    labelZh: '定义说明',
    meaningZh: '该风险成立的技术定义与判定口径',
    type: 'string',
    status: 'shipped',
    researchColumn: 'definition',
  },
  {
    field: 'mainCauseType',
    labelZh: '主因类型',
    meaningZh: '风险主因分类，如气象、人因、交通/事故',
    type: 'string',
    example: '气象',
    status: 'planned',
    researchColumn: 'mainCauseType',
  },
  {
    field: 'isRootCause',
    labelZh: '是否根因',
    meaningZh: 'true=可作为因果链根节点；false=多为衍生后果',
    type: 'boolean',
    example: 'true',
    status: 'shipped',
    researchColumn: 'isRootCause',
  },
  {
    field: 'affectedActivities',
    labelZh: '影响活动范围',
    meaningZh: '受影响的活动类型（户外、驾驶、冰川活动等）',
    type: 'string[]',
    example: '["所有户外活动","驾驶"]',
    status: 'planned',
    researchColumn: 'affectedActivities',
  },
  {
    field: 'affectedTransport',
    labelZh: '影响交通方式',
    meaningZh: '受影响的载具/交通（全车辆、航空/船等）',
    type: 'string[]',
    example: '["所有车辆"]',
    status: 'planned',
    researchColumn: 'affectedTransport',
  },
  {
    field: 'spatialScope',
    labelZh: '空间尺度',
    meaningZh: '风险作用空间范围：区域/局部/流域级/个人',
    type: 'string',
    example: '区域',
    status: 'planned',
    researchColumn: 'spatialScope',
  },
  {
    field: 'temporalScope',
    labelZh: '时间尺度',
    meaningZh: '风险演变时间粒度：分钟级/小时级/天级',
    type: 'string',
    example: '小时级',
    status: 'planned',
    researchColumn: 'temporalScope',
  },
  {
    field: 'confidenceRule',
    labelZh: '置信规则',
    meaningZh: '触发/判定该风险的置信或证据充分性规则摘要',
    type: 'string',
    status: 'planned',
    researchColumn: 'confidenceRule',
  },
  {
    field: 'regionalDiffReferences',
    labelZh: '地区差异参考',
    meaningZh: '不同目的地差异引用（如 NZ 北岛/南岛、冰岛南岸）',
    type: 'string[]',
    status: 'planned',
    researchColumn: 'regionalDiffReferences',
  },
  {
    field: 'evidenceSource',
    labelZh: '证据来源',
    meaningZh: '权威依据来源（NWS、IMO、NZTA、WHO、ICAO 等）',
    type: 'string',
    status: 'planned',
    researchColumn: 'evidenceSource',
  },
  {
    field: 'evidenceGrade',
    labelZh: '证据等级',
    meaningZh: '证据可靠性等级 A–D',
    type: 'string',
    example: 'A',
    status: 'planned',
    researchColumn: 'evidenceGrade',
  },
  {
    field: 'sourceAliases',
    labelZh: '来源别名',
    meaningZh: '外部系统/旧编码别名，用于映射归并',
    type: 'string[]',
    example: '["STRONG_WIND","HIGH_WIND"]',
    status: 'shipped',
  },
  {
    field: 'status',
    labelZh: '条目状态',
    meaningZh: '该定义条目生命周期状态（DRAFT 等）',
    type: 'string',
    status: 'shipped',
  },
  {
    field: 'since',
    labelZh: '生效起始',
    meaningZh: '该定义纳入知识库的起始日期',
    type: 'string',
    example: '2026-07-09',
    status: 'shipped',
  },
  {
    field: 'generationMode',
    labelZh: '生成模式',
    meaningZh: '风险如何产生：直接检测/因果推导/方案模拟/仅投影',
    type: 'string',
    example: 'DIRECT_DETECTION',
    status: 'shipped',
  },
  {
    field: 'capabilityStatus',
    labelZh: '能力状态',
    meaningZh: '该风险能力是否已启用（能力矩阵）',
    type: 'string',
    example: 'ENABLED',
    status: 'shipped',
  },
];

export const SEVERITY_FIELDS: KnowledgeFieldDesc[] = [
  {
    field: 'ruleId',
    labelZh: '规则 ID',
    meaningZh: '单条阈值规则唯一标识',
    type: 'string',
    example: 'SR-ENV-WIND-01-STOP-20',
    status: 'shipped',
  },
  {
    field: 'riskCode',
    labelZh: '风险编码',
    meaningZh: '所属风险（等同 knowledgeCode）',
    type: 'string',
    example: 'ENV-WIND-01',
    status: 'derived',
    researchColumn: 'riskCode',
  },
  {
    field: 'knowledgeCode',
    labelZh: '知识编码',
    meaningZh: '规则绑定的风险知识编码',
    type: 'string',
    status: 'shipped',
  },
  {
    field: 'riskName',
    labelZh: '风险名称',
    meaningZh: '风险中文名（列表聚合时由定义表补齐）',
    type: 'string',
    example: '持续强风',
    status: 'derived',
    researchColumn: 'riskName',
  },
  {
    field: 'observationIndicator',
    labelZh: '观测指标',
    meaningZh: '用于判定的观测指标（等同 metric + unit）',
    type: 'string',
    example: '风速 m/s',
    status: 'derived',
    researchColumn: 'observationIndicator',
  },
  {
    field: 'metric',
    labelZh: '指标 ID',
    meaningZh: '机器可读观测指标枚举',
    type: 'string',
    example: 'WIND_SUSTAINED_MPS',
    status: 'shipped',
  },
  {
    field: 'unit',
    labelZh: '单位',
    meaningZh: '指标单位',
    type: 'string',
    example: 'MPS',
    status: 'shipped',
  },
  {
    field: 'level',
    labelZh: '门禁等级',
    meaningZh: '命中后的执行门禁：ALLOW / AT_RISK / REPLAN_REQUIRED / STOP / RECOVERY',
    type: 'string',
    example: 'STOP',
    status: 'shipped',
  },
  {
    field: 'normalCondition',
    labelZh: '正常条件',
    meaningZh: '研究表：处于安全/正常区间的条件描述（多规则汇总呈现）',
    type: 'string',
    status: 'planned',
    researchColumn: 'normalCondition',
  },
  {
    field: 'atRiskCondition',
    labelZh: '有风险条件',
    meaningZh: '研究表：进入 AT_RISK 的阈值描述',
    type: 'string',
    status: 'planned',
    researchColumn: 'atRiskCondition',
  },
  {
    field: 'replanCondition',
    labelZh: '需改线条件',
    meaningZh: '研究表：进入 REPLAN_REQUIRED 的阈值描述',
    type: 'string',
    status: 'planned',
    researchColumn: 'replanCondition',
  },
  {
    field: 'stopCondition',
    labelZh: '停止条件',
    meaningZh: '研究表：进入 STOP 的阈值描述（本条 level=STOP 时由 operator+minValue 表达）',
    type: 'string',
    status: 'derived',
    researchColumn: 'stopCondition',
  },
  {
    field: 'recoveryCondition',
    labelZh: '恢复条件',
    meaningZh: '研究表：风险解除/降级条件（level=RECOVERY 规则）',
    type: 'string',
    status: 'derived',
    researchColumn: 'recoveryCondition',
  },
  {
    field: 'operator',
    labelZh: '比较算子',
    meaningZh: 'GTE/GT/LTE/LT/BETWEEN/EQ',
    type: 'string',
    example: 'GTE',
    status: 'shipped',
  },
  {
    field: 'minValue',
    labelZh: '最小阈值',
    meaningZh: '比较下限（或单阈值）',
    type: 'number',
    example: '20',
    status: 'shipped',
  },
  {
    field: 'maxValue',
    labelZh: '最大阈值',
    meaningZh: '比较上限（BETWEEN 等）',
    type: 'number',
    status: 'shipped',
  },
  {
    field: 'conditions',
    labelZh: '附加条件',
    meaningZh: '情境修饰条件（车辆类型、成员属性等），对应研究表 activity/vehicle/member/official 修饰列',
    type: 'object[]',
    status: 'shipped',
    researchColumn: 'activityModifier|vehicleModifier|memberModifier|officialRuleModifier',
  },
  {
    field: 'activityModifier',
    labelZh: '活动修饰',
    meaningZh: '按活动类型下调/上调阈值（徒步、桨艇等）',
    type: 'string',
    status: 'planned',
    researchColumn: 'activityModifier',
  },
  {
    field: 'vehicleModifier',
    labelZh: '车辆修饰',
    meaningZh: '按车型调整阈值（高重心车、轿车等）',
    type: 'string',
    status: 'planned',
    researchColumn: 'vehicleModifier',
  },
  {
    field: 'memberModifier',
    labelZh: '成员修饰',
    meaningZh: '按成员画像调整（儿童/老人等）',
    type: 'string',
    status: 'planned',
    researchColumn: 'memberModifier',
  },
  {
    field: 'officialRuleModifier',
    labelZh: '官方规则修饰',
    meaningZh: '官方警告/法规覆盖阈值',
    type: 'string',
    status: 'planned',
    researchColumn: 'officialRuleModifier',
  },
  {
    field: 'priority',
    labelZh: '优先级',
    meaningZh: '同风险多规则匹配时优先级（数字越小越优先）',
    type: 'number',
    example: '1',
    status: 'shipped',
  },
  {
    field: 'description',
    labelZh: '规则说明',
    meaningZh: '该阈值规则的人可读说明',
    type: 'string',
    status: 'shipped',
  },
  {
    field: 'evidenceIds',
    labelZh: '证据 ID 列表',
    meaningZh: '支撑该阈值的证据引用 ID',
    type: 'string[]',
    status: 'shipped',
  },
  {
    field: 'evidenceSource',
    labelZh: '证据来源',
    meaningZh: '研究表：权威来源名称（可由 evidenceIds 解析）',
    type: 'string',
    status: 'planned',
    researchColumn: 'evidenceSource',
  },
  {
    field: 'conditionText',
    labelZh: '条件文本',
    meaningZh: '由 operator+阈值拼出的可读条件（便于表格展示）',
    type: 'string',
    example: '>= 20 MPS',
    status: 'derived',
  },
];

export const CAUSAL_CHAIN_FIELDS: KnowledgeFieldDesc[] = [
  {
    field: 'chainId',
    labelZh: '因果链 ID',
    meaningZh: '因果链唯一标识（研究表 chainID）',
    type: 'string',
    example: 'CC-E1',
    status: 'shipped',
    researchColumn: 'chainID',
  },
  {
    field: 'rootCause',
    labelZh: '风险根源',
    meaningZh: '根因中文/描述（由 ROOT_CAUSE 节点推导）',
    type: 'string',
    example: '强风',
    status: 'derived',
    researchColumn: 'rootCause',
  },
  {
    field: 'rootCauseCode',
    labelZh: '根因编码',
    meaningZh: '根因知识编码（等同 knowledgeCode / 根节点 knowledgeCode）',
    type: 'string',
    example: 'ENV-WIND-01',
    status: 'derived',
    researchColumn: 'rootCauseCode',
  },
  {
    field: 'knowledgeCode',
    labelZh: '主知识编码',
    meaningZh: '本链锚定的主风险编码',
    type: 'string',
    status: 'shipped',
  },
  {
    field: 'name',
    labelZh: '因果链名称',
    meaningZh: '链的标题，便于运营浏览',
    type: 'string',
    status: 'shipped',
  },
  {
    field: 'directImpacts',
    labelZh: '直接影响',
    meaningZh: '研究表 directImpact1/2：nodeType=DIRECT_IMPACT 的节点列表',
    type: 'object[]',
    status: 'derived',
    researchColumn: 'directImpact1|directImpact2',
  },
  {
    field: 'derivedImpacts',
    labelZh: '衍生影响',
    meaningZh: '研究表 derivedImpact1/2/3：nodeType=DERIVED_IMPACT 的节点列表',
    type: 'object[]',
    status: 'derived',
    researchColumn: 'derivedImpact1|derivedImpact2|derivedImpact3',
  },
  {
    field: 'decisionTrigger',
    labelZh: '决策触发点',
    meaningZh: '触发改线/决策的条件描述（DECISION_TRIGGER 节点）',
    type: 'string',
    status: 'derived',
    researchColumn: 'decisionTrigger',
  },
  {
    field: 'sharedSolution',
    labelZh: '公共解决方案',
    meaningZh: '研究表：该根因对应的标准处置摘要（P2；现可由动作库关联）',
    type: 'string',
    status: 'planned',
    researchColumn: 'sharedSolution',
  },
  {
    field: 'clusterRule',
    labelZh: '汇聚规则',
    meaningZh: '多风险如何聚合成一张调整卡（clusterHint）',
    type: 'object',
    status: 'derived',
    researchColumn: 'clusterRule',
  },
  {
    field: 'recoveryCascade',
    labelZh: '恢复与联动',
    meaningZh: '研究表：恢复条件与联动清障规则（P2）',
    type: 'string',
    status: 'planned',
    researchColumn: 'recoveryCascade',
  },
  {
    field: 'applicableDomains',
    labelZh: '适用领域',
    meaningZh: '影响域标签：ENV/ROAD/ROUTE/SCHEDULE/BOOK/TEAM 等',
    type: 'string[]',
    status: 'planned',
    researchColumn: 'applicableDomains',
  },
  {
    field: 'nodes',
    labelZh: '节点列表',
    meaningZh: '因果图节点（根因/直接/衍生/决策触发/解除）',
    type: 'object[]',
    status: 'shipped',
  },
  {
    field: 'edges',
    labelZh: '边列表',
    meaningZh: '节点因果关系边（CAUSES/AMPLIFIES/RESOLVES/TRIGGERS）',
    type: 'object[]',
    status: 'shipped',
  },
  {
    field: 'clusterHint',
    labelZh: '聚类提示',
    meaningZh: '主码、可抑制的独立风险码等，用于一张卡聚合',
    type: 'object',
    status: 'shipped',
  },
];

export const ACTION_FIELDS: KnowledgeFieldDesc[] = [
  {
    field: 'actionCode',
    labelZh: '动作编码',
    meaningZh: '干预动作唯一编码',
    type: 'string',
    example: 'ACT-TIME-EARLIER',
    status: 'shipped',
    researchColumn: 'actionCode',
  },
  {
    field: 'actionName',
    labelZh: '动作名称',
    meaningZh: '动作中文名（由 name.zh 推导）',
    type: 'string',
    example: '提前出发',
    status: 'derived',
    researchColumn: 'actionName',
  },
  {
    field: 'name',
    labelZh: '多语言名称',
    meaningZh: '结构化名称',
    type: 'object|string',
    status: 'shipped',
  },
  {
    field: 'actionCategory',
    labelZh: '动作类别',
    meaningZh: '时间/路线/活动/预订/团队/交通/应急调整',
    type: 'string',
    example: 'TIMING',
    status: 'shipped',
    researchColumn: 'actionCategory',
  },
  {
    field: 'description',
    labelZh: '动作描述',
    meaningZh: '动作做什么',
    type: 'string',
    status: 'shipped',
    researchColumn: 'description',
  },
  {
    field: 'typicalUseCase',
    labelZh: '典型场景',
    meaningZh: '何时建议使用该动作',
    type: 'string',
    status: 'shipped',
    researchColumn: 'typicalUseCase',
  },
  {
    field: 'safetyImpact',
    labelZh: '安全影响',
    meaningZh: '对安全评分的影响（通常 -2…+2）',
    type: 'number',
    example: '1',
    status: 'shipped',
    researchColumn: 'safetyImpact',
  },
  {
    field: 'timeImpactMin',
    labelZh: '时间影响（分钟）',
    meaningZh: '研究表列；API 为 timeImpactMinRange.min/max',
    type: 'string',
    example: '+30 ~ +120',
    status: 'derived',
    researchColumn: 'timeImpactMin',
  },
  {
    field: 'timeImpactMinRange',
    labelZh: '时间影响区间',
    meaningZh: '预计耗时变化分钟区间（负=提前）',
    type: 'object',
    example: '{ "min": -120, "max": -15 }',
    status: 'shipped',
  },
  {
    field: 'fatigueImpact',
    labelZh: '疲劳影响',
    meaningZh: '对成员疲劳的影响分',
    type: 'number',
    status: 'shipped',
    researchColumn: 'fatigueImpact',
  },
  {
    field: 'experienceImpact',
    labelZh: '体验影响',
    meaningZh: '对行程体验质量的影响分',
    type: 'number',
    status: 'shipped',
    researchColumn: 'experienceImpact',
  },
  {
    field: 'budgetImpact',
    labelZh: '预算影响',
    meaningZh: '费用影响描述（研究表）；API 字段为 budgetImpactDescription',
    type: 'string',
    status: 'derived',
    researchColumn: 'budgetImpact',
  },
  {
    field: 'budgetImpactDescription',
    labelZh: '预算影响说明',
    meaningZh: '额外费用/退款损失等文字说明',
    type: 'string',
    status: 'shipped',
  },
  {
    field: 'bookingImpact',
    labelZh: '预订影响',
    meaningZh: '对已有预订：无/通知/改期/取消/新订等',
    type: 'string',
    example: 'NOTIFY',
    status: 'shipped',
    researchColumn: 'bookingImpact',
  },
  {
    field: 'reversibility',
    labelZh: '可逆性',
    meaningZh: '动作是否可撤销：YES / PARTIAL / NO',
    type: 'string',
    example: 'YES',
    status: 'shipped',
    researchColumn: 'reversibility',
  },
  {
    field: 'userConfirmRequired',
    labelZh: '需用户确认',
    meaningZh: '执行前是否必须人工确认',
    type: 'boolean',
    status: 'shipped',
    researchColumn: 'userConfirmRequired',
  },
  {
    field: 'isAutoExecutable',
    labelZh: '可自动执行',
    meaningZh: '研究表列；API 字段 aiAutoExecutable',
    type: 'boolean',
    status: 'derived',
    researchColumn: 'isAutoExecutable',
  },
  {
    field: 'aiAutoExecutable',
    labelZh: 'AI 可自动执行',
    meaningZh: '系统是否允许自动触发该动作',
    type: 'boolean',
    status: 'shipped',
  },
  {
    field: 'applicableRiskCodes',
    labelZh: '适用风险编码',
    meaningZh: '哪些风险可推荐此动作',
    type: 'string[]',
    status: 'shipped',
    researchColumn: 'applicableRiskCodes',
  },
  {
    field: 'capabilities',
    labelZh: '所需能力',
    meaningZh: '执行该动作需要的系统能力标签',
    type: 'string[]',
    status: 'shipped',
  },
  {
    field: 'executionMode',
    labelZh: '执行模式',
    meaningZh: '如 CONFIRM_BEFORE_WRITE（写前确认）',
    type: 'string',
    status: 'shipped',
  },
];

export const VERSION_FIELDS: KnowledgeFieldDesc[] = [
  {
    field: 'id',
    labelZh: '版本 ID',
    meaningZh: '知识版本主键',
    type: 'string',
    status: 'shipped',
  },
  {
    field: 'packageVersion',
    labelZh: 'Package 版本号',
    meaningZh: '导入时的 package 语义版本',
    type: 'string',
    status: 'shipped',
  },
  {
    field: 'status',
    labelZh: '版本状态',
    meaningZh: 'DRAFT 可编辑；VALIDATED 可激活；DEPRECATED 已废弃',
    type: 'string',
    status: 'shipped',
  },
  {
    field: 'isActive',
    labelZh: '是否激活',
    meaningZh: '运行时是否使用此版本（全局最多一个 true）',
    type: 'boolean',
    status: 'shipped',
  },
  {
    field: 'sourcePath',
    labelZh: '来源路径',
    meaningZh: '导入的 package 目录',
    type: 'string',
    status: 'shipped',
  },
  {
    field: 'rowCounts',
    labelZh: '行数统计',
    meaningZh: '定义/规则/因果链/动作条数',
    type: 'object',
    status: 'shipped',
  },
  {
    field: 'importedAt',
    labelZh: '导入时间',
    meaningZh: '版本导入时间',
    type: 'datetime',
    status: 'shipped',
  },
  {
    field: 'activatedAt',
    labelZh: '激活时间',
    meaningZh: '最近一次激活时间',
    type: 'datetime',
    status: 'shipped',
  },
];

export function getKnowledgeFieldCatalog() {
  return {
    tables: [
      {
        tableId: 'definitions',
        tableNameZh: '风险定义总表',
        researchSheet: '风险定义',
        apiPath: 'versions/:versionId/definitions',
        fields: DEFINITION_FIELDS,
      },
      {
        tableId: 'severity-rules',
        tableNameZh: '阈值矩阵 / 严重度规则',
        researchSheet: '阈值条件',
        apiPath: 'versions/:versionId/severity-rules',
        fields: SEVERITY_FIELDS,
      },
      {
        tableId: 'causal-chains',
        tableNameZh: '因果链',
        researchSheet: '因果链与汇聚',
        apiPath: 'versions/:versionId/causal-chains',
        fields: CAUSAL_CHAIN_FIELDS,
      },
      {
        tableId: 'actions',
        tableNameZh: '干预动作库',
        researchSheet: '调整动作',
        apiPath: 'versions/:versionId/actions',
        fields: ACTION_FIELDS,
      },
      {
        tableId: 'versions',
        tableNameZh: '知识版本',
        researchSheet: null,
        apiPath: 'versions',
        fields: VERSION_FIELDS,
      },
    ],
    legend: {
      shipped: 'API 已落库并返回',
      derived: '由已有字段推导，列表/详情已展开便于表格展示',
      planned: '研究表有列、P2 才落库；当前固定返回 null，便于前端先占位列',
    },
  };
}

export function displayNameZh(displayName: unknown): string | null {
  if (displayName == null) return null;
  if (typeof displayName === 'string') return displayName;
  const obj = displayName as Record<string, string>;
  return obj.zh ?? obj.en ?? Object.values(obj)[0] ?? null;
}

export function enrichDefinitionRow(row: {
  canonicalCode: string;
  knowledgeCode: string;
  riskType: string;
  displayName: unknown;
  definition: string;
  isRootCause: boolean;
  sourceAliases: unknown;
  status: string;
  since: string | null;
  generationMode: string | null;
  capabilityStatus: string | null;
}) {
  const itemName = displayNameZh(row.displayName);
  return {
    // research-aligned
    riskCode: row.knowledgeCode,
    riskType: row.riskType,
    subCategory: null as string | null,
    itemName,
    definition: row.definition,
    mainCauseType: null as string | null,
    isRootCause: row.isRootCause,
    affectedActivities: null as string[] | null,
    affectedTransport: stringNullArray(),
    spatialScope: null as string | null,
    temporalScope: null as string | null,
    confidenceRule: null as string | null,
    regionalDiffReferences: null as string[] | null,
    evidenceSource: null as string | null,
    evidenceGrade: null as string | null,
    // engine fields
    knowledgeCode: row.knowledgeCode,
    canonicalCode: row.canonicalCode,
    displayName: row.displayName,
    sourceAliases: row.sourceAliases,
    status: row.status,
    since: row.since,
    generationMode: row.generationMode,
    capabilityStatus: row.capabilityStatus,
  };
}

function stringNullArray(): string[] | null {
  return null;
}

export function enrichSeverityPayload(
  payload: Record<string, unknown>,
  riskName?: string | null,
) {
  const metric = String(payload.metric ?? '');
  const unit = String(payload.unit ?? '');
  const operator = String(payload.operator ?? '');
  const minValue = payload.minValue;
  const maxValue = payload.maxValue;
  const level = String(payload.level ?? '');
  const conditionText =
    maxValue != null
      ? `${operator} ${minValue}..${maxValue} ${unit}`.trim()
      : `${operator} ${minValue ?? ''} ${unit}`.trim();

  return {
    ...payload,
    riskCode: payload.knowledgeCode,
    riskName: riskName ?? null,
    observationIndicator: metric && unit ? `${metric} (${unit})` : metric || null,
    normalCondition: null,
    atRiskCondition: level === 'AT_RISK' ? conditionText : null,
    replanCondition:
      level === 'REPLAN' || level === 'REPLAN_REQUIRED' ? conditionText : null,
    stopCondition: level === 'STOP' ? conditionText : null,
    recoveryCondition: level === 'RECOVERY' ? conditionText : null,
    activityModifier: null,
    vehicleModifier: null,
    memberModifier: null,
    officialRuleModifier: null,
    evidenceSource: null,
    conditionText,
  };
}

export function enrichCausalChainPayload(payload: Record<string, unknown>) {
  const nodes = Array.isArray(payload.nodes)
    ? (payload.nodes as Array<Record<string, unknown>>)
    : [];
  const root = nodes.find((n) => n.nodeType === 'ROOT_CAUSE') ?? nodes[0];
  const directImpacts = nodes.filter((n) => n.nodeType === 'DIRECT_IMPACT');
  const derivedImpacts = nodes.filter((n) => n.nodeType === 'DERIVED_IMPACT');
  const decision = nodes.find((n) => n.nodeType === 'DECISION_TRIGGER');

  return {
    ...payload,
    chainID: payload.chainId,
    rootCause: root ? String(root.description ?? '') : null,
    rootCauseCode: String(payload.knowledgeCode ?? root?.knowledgeCode ?? ''),
    directImpact1: directImpacts[0]?.description ?? null,
    directImpact2: directImpacts[1]?.description ?? null,
    directImpacts,
    derivedImpact1: derivedImpacts[0]?.description ?? null,
    derivedImpact2: derivedImpacts[1]?.description ?? null,
    derivedImpact3: derivedImpacts[2]?.description ?? null,
    derivedImpacts,
    decisionTrigger: decision ? String(decision.description ?? '') : null,
    sharedSolution: null,
    clusterRule: payload.clusterHint ?? null,
    recoveryCascade: null,
    applicableDomains: null,
  };
}

export function enrichActionPayload(payload: Record<string, unknown>) {
  const name = payload.name;
  const actionName = displayNameZh(name);
  const range = payload.timeImpactMinRange as { min?: number; max?: number } | undefined;
  const timeImpactMin =
    range && range.min != null && range.max != null
      ? `${range.min} ~ ${range.max}`
      : null;

  return {
    ...payload,
    actionName,
    timeImpactMin,
    budgetImpact: payload.budgetImpactDescription ?? null,
    isAutoExecutable: payload.aiAutoExecutable ?? null,
  };
}
