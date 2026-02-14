"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serializePackForAdmin = serializePackForAdmin;
const i18n_utils_1 = require("./i18n.utils");
function serializePackForAdmin(pack, lang = 'zh') {
    var _a, _b;
    return {
        ...pack,
        displayName: (0, i18n_utils_1.getLocalizedText)(pack.displayName, lang),
        displayNameRaw: pack.displayName,
        geo: {
            ...pack.geo,
            region: typeof pack.geo.region === 'string'
                ? pack.geo.region
                : (0, i18n_utils_1.getLocalizedText)(pack.geo.region, lang),
            regionRaw: pack.geo.region,
            city: typeof pack.geo.city === 'string'
                ? pack.geo.city
                : (0, i18n_utils_1.getLocalizedText)(pack.geo.city, lang),
            cityRaw: pack.geo.city,
        },
        rules: pack.rules.map(rule => serializeRuleForAdmin(rule, lang)),
        checklists: (_a = pack.checklists) === null || _a === void 0 ? void 0 : _a.map(checklist => serializeChecklistForAdmin(checklist, lang)),
        hazards: (_b = pack.hazards) === null || _b === void 0 ? void 0 : _b.map(hazard => serializeHazardForAdmin(hazard, lang)),
    };
}
function serializeRuleForAdmin(rule, lang = 'zh') {
    var _a, _b, _c;
    const rootMessage = rule.message || ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.message);
    const rootSeasons = rule.seasons || ((_b = rule.appliesTo) === null || _b === void 0 ? void 0 : _b.seasons);
    const rootTasks = rule.tasks || ((_c = rule.then) === null || _c === void 0 ? void 0 : _c.tasks);
    return {
        ...rule,
        title: rule.title ? (0, i18n_utils_1.getLocalizedText)(rule.title, lang) : undefined,
        titleRaw: rule.title,
        description: rule.description ? (0, i18n_utils_1.getLocalizedText)(rule.description, lang) : undefined,
        descriptionRaw: rule.description,
        message: rootMessage ? (0, i18n_utils_1.getLocalizedText)(rootMessage, lang) : undefined,
        messageRaw: rootMessage,
        seasons: rootSeasons,
        required: rule.required,
        tasks: rootTasks === null || rootTasks === void 0 ? void 0 : rootTasks.map(task => ({
            ...task,
            title: (0, i18n_utils_1.getLocalizedText)(task.title, lang),
            titleRaw: task.title,
        })),
        notes: rule.notes ? (0, i18n_utils_1.getLocalizedText)(rule.notes, lang) : undefined,
        notesRaw: rule.notes,
        then: serializeActionForAdmin(rule.then, lang),
        whenDisplay: formatConditionForDisplay(rule.when, lang),
        when: rule.when,
        userDecision: rule.userDecision ? serializeUserDecisionForAdmin(rule.userDecision, lang) : undefined,
    };
}
function serializeActionForAdmin(action, lang = 'zh') {
    var _a, _b;
    return {
        level: action.level,
        message: (0, i18n_utils_1.getLocalizedText)(action.message, lang),
        messageRaw: action.message,
        tasks: (_a = action.tasks) === null || _a === void 0 ? void 0 : _a.map(task => ({
            ...task,
            title: (0, i18n_utils_1.getLocalizedText)(task.title, lang),
            titleRaw: task.title,
        })),
        askUser: (_b = action.askUser) === null || _b === void 0 ? void 0 : _b.map(q => (0, i18n_utils_1.getLocalizedText)(q, lang)),
        userDecision: action.userDecision ? serializeUserDecisionForAdmin(action.userDecision, lang) : undefined,
    };
}
function serializeChecklistForAdmin(checklist, lang = 'zh') {
    return {
        ...checklist,
        title: checklist.title ? (0, i18n_utils_1.getLocalizedText)(checklist.title, lang) : undefined,
        titleRaw: checklist.title,
        description: checklist.description ? (0, i18n_utils_1.getLocalizedText)(checklist.description, lang) : undefined,
        descriptionRaw: checklist.description,
        items: checklist.items.map((item) => (0, i18n_utils_1.getLocalizedText)(item, lang)),
        itemsRaw: checklist.items,
        required: checklist.required,
        priority: checklist.priority,
        checklistCategory: checklist.checklistCategory,
    };
}
function serializeHazardForAdmin(hazard, lang = 'zh') {
    var _a, _b;
    const level = hazard.level || hazard.severity;
    const description = ((_a = hazard.metadata) === null || _a === void 0 ? void 0 : _a.description) || hazard.summary;
    const precautions = ((_b = hazard.metadata) === null || _b === void 0 ? void 0 : _b.precautions) || hazard.mitigations;
    return {
        ...hazard,
        zoneId: hazard.zoneId,
        level: level,
        levelRaw: hazard.level,
        severity: hazard.severity,
        seasons: hazard.seasons,
        summary: (0, i18n_utils_1.getLocalizedText)(hazard.summary, lang),
        summaryRaw: hazard.summary,
        mitigations: hazard.mitigations.map((m) => (0, i18n_utils_1.getLocalizedText)(m, lang)),
        mitigationsRaw: hazard.mitigations,
        metadata: hazard.metadata ? {
            ...hazard.metadata,
            description: description ? (0, i18n_utils_1.getLocalizedText)(description, lang) : undefined,
            descriptionRaw: description,
            precautions: precautions === null || precautions === void 0 ? void 0 : precautions.map((p) => (0, i18n_utils_1.getLocalizedText)(p, lang)),
            precautionsRaw: precautions,
        } : undefined,
    };
}
function serializeUserDecisionForAdmin(userDecision, lang = 'zh') {
    var _a, _b;
    return {
        questions: (_a = userDecision.questions) === null || _a === void 0 ? void 0 : _a.map((q) => {
            var _a;
            return ({
                ...q,
                question: (0, i18n_utils_1.getLocalizedText)(q.question, lang),
                questionRaw: q.question,
                description: q.description ? (0, i18n_utils_1.getLocalizedText)(q.description, lang) : undefined,
                placeholder: q.placeholder ? (0, i18n_utils_1.getLocalizedText)(q.placeholder, lang) : undefined,
                options: (_a = q.options) === null || _a === void 0 ? void 0 : _a.map((opt) => ({
                    ...opt,
                    label: (0, i18n_utils_1.getLocalizedText)(opt.label, lang),
                    labelRaw: opt.label,
                    description: opt.description ? (0, i18n_utils_1.getLocalizedText)(opt.description, lang) : undefined,
                })),
            });
        }),
        groups: (_b = userDecision.groups) === null || _b === void 0 ? void 0 : _b.map((g) => ({
            ...g,
            title: (0, i18n_utils_1.getLocalizedText)(g.title, lang),
            titleRaw: g.title,
            description: g.description ? (0, i18n_utils_1.getLocalizedText)(g.description, lang) : undefined,
        })),
        branches: userDecision.branches,
        defaultBranch: userDecision.defaultBranch,
    };
}
function formatConditionForDisplay(condition, lang = 'zh') {
    if (!condition) {
        return lang === 'zh' ? '无条件（总是触发）' : 'No condition (always trigger)';
    }
    const parts = [];
    if (condition.all && condition.all.length > 0) {
        const allParts = condition.all.map(c => formatConditionForDisplay(c, lang));
        return lang === 'zh'
            ? `所有条件: ${allParts.join(' AND ')}`
            : `All conditions: ${allParts.join(' AND ')}`;
    }
    if (condition.any && condition.any.length > 0) {
        const anyParts = condition.any.map(c => formatConditionForDisplay(c, lang));
        return lang === 'zh'
            ? `任一条件: ${anyParts.join(' OR ')}`
            : `Any condition: ${anyParts.join(' OR ')}`;
    }
    if (condition.not) {
        const notPart = formatConditionForDisplay(condition.not, lang);
        return lang === 'zh' ? `NOT (${notPart})` : `NOT (${notPart})`;
    }
    if (condition.exists) {
        return lang === 'zh' ? `存在: ${condition.exists}` : `Exists: ${condition.exists}`;
    }
    if (condition.eq) {
        return lang === 'zh'
            ? `${condition.eq.path} = ${formatValue(condition.eq.value)}`
            : `${condition.eq.path} = ${formatValue(condition.eq.value)}`;
    }
    if (condition.ne) {
        return lang === 'zh'
            ? `${condition.ne.path} != ${formatValue(condition.ne.value)}`
            : `${condition.ne.path} != ${formatValue(condition.ne.value)}`;
    }
    if (condition.gt) {
        return lang === 'zh'
            ? `${condition.gt.path} > ${condition.gt.value}`
            : `${condition.gt.path} > ${condition.gt.value}`;
    }
    if (condition.gte) {
        return lang === 'zh'
            ? `${condition.gte.path} >= ${condition.gte.value}`
            : `${condition.gte.path} >= ${condition.gte.value}`;
    }
    if (condition.lt) {
        return lang === 'zh'
            ? `${condition.lt.path} < ${condition.lt.value}`
            : `${condition.lt.path} < ${condition.lt.value}`;
    }
    if (condition.lte) {
        return lang === 'zh'
            ? `${condition.lte.path} <= ${condition.lte.value}`
            : `${condition.lte.path} <= ${condition.lte.value}`;
    }
    if (condition.in) {
        return lang === 'zh'
            ? `${condition.in.path} IN [${condition.in.values.map(formatValue).join(', ')}]`
            : `${condition.in.path} IN [${condition.in.values.map(formatValue).join(', ')}]`;
    }
    if (condition.containsAny) {
        return lang === 'zh'
            ? `${condition.containsAny.path} 包含任一: [${condition.containsAny.values.join(', ')}]`
            : `${condition.containsAny.path} contains any: [${condition.containsAny.values.join(', ')}]`;
    }
    if (condition.geo) {
        const geoParts = [];
        if (condition.geo.mountains) {
            if (condition.geo.mountains.inMountain !== undefined) {
                geoParts.push(lang === 'zh'
                    ? `在山脉内: ${condition.geo.mountains.inMountain}`
                    : `In mountain: ${condition.geo.mountains.inMountain}`);
            }
            if (condition.geo.mountains.mountainElevationAvg) {
                const elev = condition.geo.mountains.mountainElevationAvg;
                const elevStr = Object.entries(elev)
                    .map(([op, val]) => `${op === 'gte' ? '>=' : op === 'gt' ? '>' : op === 'lte' ? '<=' : '<'} ${val}`)
                    .join(' AND ');
                geoParts.push(lang === 'zh' ? `平均海拔: ${elevStr}` : `Avg elevation: ${elevStr}`);
            }
        }
        if (condition.geo.rivers) {
            if (condition.geo.rivers.nearRiver !== undefined) {
                geoParts.push(lang === 'zh'
                    ? `靠近河流: ${condition.geo.rivers.nearRiver}`
                    : `Near river: ${condition.geo.rivers.nearRiver}`);
            }
        }
        if (condition.geo.roads) {
            if (condition.geo.roads.nearRoad !== undefined) {
                geoParts.push(lang === 'zh'
                    ? `靠近道路: ${condition.geo.roads.nearRoad}`
                    : `Near road: ${condition.geo.roads.nearRoad}`);
            }
        }
        if (condition.geo.pois) {
            if (condition.geo.pois.hasEVCharger !== undefined) {
                geoParts.push(lang === 'zh'
                    ? `有充电桩: ${condition.geo.pois.hasEVCharger}`
                    : `Has EV charger: ${condition.geo.pois.hasEVCharger}`);
            }
        }
        if (geoParts.length > 0) {
            return lang === 'zh' ? `地理条件: ${geoParts.join(', ')}` : `Geo conditions: ${geoParts.join(', ')}`;
        }
    }
    return JSON.stringify(condition, null, 2);
}
function formatValue(value) {
    if (typeof value === 'string') {
        return `"${value}"`;
    }
    if (Array.isArray(value)) {
        return `[${value.map(formatValue).join(', ')}]`;
    }
    return String(value);
}
//# sourceMappingURL=pack-serializer.util.js.map