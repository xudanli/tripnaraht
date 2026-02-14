"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deserializePackFromAdmin = deserializePackFromAdmin;
function deserializePackFromAdmin(packData) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    if (packData._raw) {
        return mergePackUpdates(packData._raw, packData);
    }
    const checklists = ((_a = packData.checklists) === null || _a === void 0 ? void 0 : _a.map((checklist) => {
        var _a;
        return ({
            ...checklist,
            items: (((_a = checklist.items) === null || _a === void 0 ? void 0 : _a.map((item) => {
                return typeof item === 'string' ? { en: item, zh: item } : item;
            })) || []),
        });
    })) || [];
    const hazards = ((_b = packData.hazards) === null || _b === void 0 ? void 0 : _b.map((hazard) => {
        var _a;
        return ({
            ...hazard,
            summary: deserializeLocalizedString(hazard.summary, hazard.summaryRaw),
            mitigations: (((_a = hazard.mitigations) === null || _a === void 0 ? void 0 : _a.map((m) => {
                return typeof m === 'string' ? { en: m, zh: m } : m;
            })) || []),
        });
    })) || [];
    return {
        ...packData,
        displayName: deserializeLocalizedString(packData.displayName, packData.displayNameRaw) || packData.displayName,
        geo: {
            ...packData.geo,
            region: deserializeLocalizedString((_c = packData.geo) === null || _c === void 0 ? void 0 : _c.region, (_d = packData.geo) === null || _d === void 0 ? void 0 : _d.regionRaw) || ((_e = packData.geo) === null || _e === void 0 ? void 0 : _e.region),
            city: deserializeLocalizedString((_f = packData.geo) === null || _f === void 0 ? void 0 : _f.city, (_g = packData.geo) === null || _g === void 0 ? void 0 : _g.cityRaw) || ((_h = packData.geo) === null || _h === void 0 ? void 0 : _h.city),
        },
        rules: ((_j = packData.rules) === null || _j === void 0 ? void 0 : _j.map((rule) => deserializeRule(rule))) || [],
        checklists,
        hazards,
    };
}
function mergePackUpdates(originalPack, updatedData) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    return {
        ...originalPack,
        displayName: deserializeLocalizedString(updatedData.displayName, updatedData.displayNameRaw) || originalPack.displayName,
        version: updatedData.version || originalPack.version,
        lastReviewedAt: updatedData.lastReviewedAt || originalPack.lastReviewedAt,
        geo: {
            ...originalPack.geo,
            region: deserializeLocalizedString((_a = updatedData.geo) === null || _a === void 0 ? void 0 : _a.region, (_b = updatedData.geo) === null || _b === void 0 ? void 0 : _b.regionRaw) || originalPack.geo.region,
            city: deserializeLocalizedString((_c = updatedData.geo) === null || _c === void 0 ? void 0 : _c.city, (_d = updatedData.geo) === null || _d === void 0 ? void 0 : _d.cityRaw) || originalPack.geo.city,
            lat: ((_e = updatedData.geo) === null || _e === void 0 ? void 0 : _e.lat) !== undefined ? updatedData.geo.lat : originalPack.geo.lat,
            lng: ((_f = updatedData.geo) === null || _f === void 0 ? void 0 : _f.lng) !== undefined ? updatedData.geo.lng : originalPack.geo.lng,
        },
        rules: ((_g = updatedData.rules) === null || _g === void 0 ? void 0 : _g.map((rule) => {
            const originalRule = originalPack.rules.find((r) => r.id === rule.id);
            return originalRule ? mergeRuleUpdates(originalRule, rule) : deserializeRule(rule);
        })) || originalPack.rules,
        checklists: ((_h = updatedData.checklists) === null || _h === void 0 ? void 0 : _h.map((checklist) => {
            const originalChecklist = originalPack.checklists.find((c) => c.id === checklist.id);
            return originalChecklist ? mergeChecklistUpdates(originalChecklist, checklist) : deserializeChecklist(checklist);
        })) || originalPack.checklists,
        hazards: ((_j = updatedData.hazards) === null || _j === void 0 ? void 0 : _j.map((hazard) => {
            var _a;
            const originalHazard = (_a = originalPack.hazards) === null || _a === void 0 ? void 0 : _a.find((h) => h.type === hazard.type);
            return originalHazard ? mergeHazardUpdates(originalHazard, hazard) : deserializeHazard(hazard);
        })) || originalPack.hazards,
    };
}
function deserializeRule(rule) {
    var _a, _b, _c, _d;
    const rootMessage = rule.messageRaw || rule.message || ((_a = rule.then) === null || _a === void 0 ? void 0 : _a.messageRaw) || ((_b = rule.then) === null || _b === void 0 ? void 0 : _b.message);
    const rootSeasons = rule.seasons || ((_c = rule.appliesTo) === null || _c === void 0 ? void 0 : _c.seasons);
    const rootTasks = rule.tasks || ((_d = rule.then) === null || _d === void 0 ? void 0 : _d.tasks);
    return {
        ...rule,
        title: deserializeLocalizedString(rule.title, rule.titleRaw),
        description: deserializeLocalizedString(rule.description, rule.descriptionRaw),
        message: rootMessage ? deserializeLocalizedString(typeof rootMessage === 'string' ? rootMessage : undefined, typeof rootMessage === 'object' ? rootMessage : undefined) : undefined,
        seasons: rootSeasons,
        required: rule.required,
        tasks: rootTasks === null || rootTasks === void 0 ? void 0 : rootTasks.map((task) => ({
            ...task,
            title: deserializeLocalizedString(task.title, task.titleRaw),
        })),
        notes: deserializeLocalizedString(rule.notes, rule.notesRaw),
        then: deserializeAction(rule.then),
        when: rule.when,
        userDecision: rule.userDecision ? deserializeUserDecision(rule.userDecision) : undefined,
    };
}
function mergeRuleUpdates(originalRule, updatedRule) {
    const rootMessage = updatedRule.messageRaw || updatedRule.message;
    const rootSeasons = updatedRule.seasons;
    const rootTasks = updatedRule.tasks;
    return {
        ...originalRule,
        title: updatedRule.titleRaw !== undefined
            ? deserializeLocalizedString(updatedRule.title, updatedRule.titleRaw)
            : originalRule.title,
        description: updatedRule.descriptionRaw !== undefined
            ? deserializeLocalizedString(updatedRule.description, updatedRule.descriptionRaw)
            : originalRule.description,
        message: rootMessage !== undefined
            ? deserializeLocalizedString(typeof rootMessage === 'string' ? rootMessage : undefined, typeof rootMessage === 'object' ? rootMessage : undefined)
            : originalRule.message,
        seasons: rootSeasons !== undefined ? rootSeasons : originalRule.seasons,
        required: updatedRule.required !== undefined ? updatedRule.required : originalRule.required,
        tasks: rootTasks !== undefined
            ? rootTasks.map((task) => ({
                ...task,
                title: deserializeLocalizedString(task.title, task.titleRaw),
            }))
            : originalRule.tasks,
        category: updatedRule.category || originalRule.category,
        severity: updatedRule.severity || originalRule.severity,
        appliesTo: updatedRule.appliesTo || originalRule.appliesTo,
        notes: deserializeLocalizedString(updatedRule.notes, updatedRule.notesRaw) || originalRule.notes,
        then: updatedRule.then ? mergeActionUpdates(originalRule.then, updatedRule.then) : originalRule.then,
        when: updatedRule.when !== undefined ? updatedRule.when : originalRule.when,
        evidence: updatedRule.evidence !== undefined ? updatedRule.evidence : originalRule.evidence,
        userDecision: updatedRule.userDecision !== undefined
            ? (updatedRule.userDecision ? deserializeUserDecision(updatedRule.userDecision) : undefined)
            : originalRule.userDecision,
    };
}
function deserializeAction(action) {
    var _a, _b, _c, _d;
    if (!action || !action.level) {
        return {
            level: 'should',
            message: { en: '', zh: '' },
        };
    }
    const message = deserializeLocalizedString(action.message, action.messageRaw);
    if (!message) {
        return {
            level: action.level,
            message: { en: '', zh: '' },
            tasks: (_a = action.tasks) === null || _a === void 0 ? void 0 : _a.map((task) => ({
                ...task,
                title: deserializeLocalizedString(task.title, task.titleRaw) || task.title,
            })),
            askUser: (_b = action.askUser) === null || _b === void 0 ? void 0 : _b.map((q) => {
                return typeof q === 'string' ? { en: q, zh: q } : q;
            }),
            userDecision: action.userDecision ? deserializeUserDecision(action.userDecision) : undefined,
        };
    }
    return {
        level: action.level,
        message: message,
        tasks: (_c = action.tasks) === null || _c === void 0 ? void 0 : _c.map((task) => ({
            ...task,
            title: deserializeLocalizedString(task.title, task.titleRaw) || task.title,
        })),
        askUser: (_d = action.askUser) === null || _d === void 0 ? void 0 : _d.map((q) => {
            return typeof q === 'string' ? { en: q, zh: q } : q;
        }),
        userDecision: action.userDecision ? deserializeUserDecision(action.userDecision) : undefined,
    };
}
function mergeActionUpdates(originalAction, updatedAction) {
    return {
        ...originalAction,
        level: updatedAction.level || originalAction.level,
        message: deserializeLocalizedString(updatedAction.message, updatedAction.messageRaw) || originalAction.message,
        tasks: updatedAction.tasks !== undefined
            ? updatedAction.tasks.map((task) => ({
                ...task,
                title: deserializeLocalizedString(task.title, task.titleRaw),
            }))
            : originalAction.tasks,
        askUser: updatedAction.askUser !== undefined ? updatedAction.askUser : originalAction.askUser,
        userDecision: updatedAction.userDecision !== undefined
            ? (updatedAction.userDecision ? deserializeUserDecision(updatedAction.userDecision) : undefined)
            : originalAction.userDecision,
    };
}
function deserializeUserDecision(userDecision) {
    var _a, _b;
    return {
        questions: (_a = userDecision.questions) === null || _a === void 0 ? void 0 : _a.map((q) => {
            var _a;
            return ({
                ...q,
                question: deserializeLocalizedString(q.question, q.questionRaw),
                description: q.description ? deserializeLocalizedString(q.description, q.descriptionRaw) : undefined,
                placeholder: q.placeholder ? deserializeLocalizedString(q.placeholder, q.placeholderRaw) : undefined,
                options: (_a = q.options) === null || _a === void 0 ? void 0 : _a.map((opt) => ({
                    ...opt,
                    label: deserializeLocalizedString(opt.label, opt.labelRaw),
                    description: opt.description ? deserializeLocalizedString(opt.description, opt.descriptionRaw) : undefined,
                })),
            });
        }),
        groups: (_b = userDecision.groups) === null || _b === void 0 ? void 0 : _b.map((g) => ({
            ...g,
            title: deserializeLocalizedString(g.title, g.titleRaw),
            description: g.description ? deserializeLocalizedString(g.description, g.descriptionRaw) : undefined,
        })),
        branches: userDecision.branches,
        defaultBranch: userDecision.defaultBranch ? {
            ...userDecision.defaultBranch,
            message: userDecision.defaultBranch.message
                ? deserializeLocalizedString(userDecision.defaultBranch.message, userDecision.defaultBranch.messageRaw)
                : undefined,
        } : undefined,
    };
}
function deserializeChecklist(checklist) {
    var _a;
    return {
        ...checklist,
        title: deserializeLocalizedString(checklist.title, checklist.titleRaw),
        description: deserializeLocalizedString(checklist.description, checklist.descriptionRaw),
        required: checklist.required,
        priority: checklist.priority,
        items: ((_a = (checklist.itemsRaw || checklist.items)) === null || _a === void 0 ? void 0 : _a.map((item) => {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                return item;
            }
            return typeof item === 'string' ? { en: item, zh: item } : item;
        })) || [],
    };
}
function mergeChecklistUpdates(originalChecklist, updatedChecklist) {
    return {
        ...originalChecklist,
        title: updatedChecklist.titleRaw !== undefined
            ? deserializeLocalizedString(updatedChecklist.title, updatedChecklist.titleRaw)
            : originalChecklist.title,
        description: updatedChecklist.descriptionRaw !== undefined
            ? deserializeLocalizedString(updatedChecklist.description, updatedChecklist.descriptionRaw)
            : originalChecklist.description,
        required: updatedChecklist.required !== undefined
            ? updatedChecklist.required
            : originalChecklist.required,
        priority: updatedChecklist.priority !== undefined
            ? updatedChecklist.priority
            : originalChecklist.priority,
        category: updatedChecklist.category || originalChecklist.category,
        appliesToSeasons: updatedChecklist.appliesToSeasons || originalChecklist.appliesToSeasons,
        items: (updatedChecklist.itemsRaw || updatedChecklist.items) !== undefined
            ? (updatedChecklist.itemsRaw || updatedChecklist.items).map((item) => {
                if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                    return item;
                }
                return typeof item === 'string' ? { en: item, zh: item } : item;
            })
            : originalChecklist.items,
    };
}
function deserializeHazard(hazard) {
    var _a, _b;
    const metadata = hazard.metadata ? {
        ...hazard.metadata,
        description: deserializeLocalizedString(hazard.metadata.description, hazard.metadata.descriptionRaw) || hazard.summary,
        precautions: ((_a = (hazard.metadata.precautionsRaw || hazard.metadata.precautions)) === null || _a === void 0 ? void 0 : _a.map((p) => {
            if (typeof p === 'object' && p !== null && !Array.isArray(p)) {
                return p;
            }
            return typeof p === 'string' ? { en: p, zh: p } : p;
        })) || hazard.mitigations,
    } : undefined;
    return {
        ...hazard,
        zoneId: hazard.zoneId,
        level: hazard.level,
        seasons: hazard.seasons,
        summary: deserializeLocalizedString(hazard.summary, hazard.summaryRaw),
        mitigations: ((_b = (hazard.mitigationsRaw || hazard.mitigations)) === null || _b === void 0 ? void 0 : _b.map((m) => {
            if (typeof m === 'object' && m !== null && !Array.isArray(m)) {
                return m;
            }
            return typeof m === 'string' ? { en: m, zh: m } : m;
        })) || [],
        metadata,
    };
}
function mergeHazardUpdates(originalHazard, updatedHazard) {
    var _a, _b;
    const metadata = updatedHazard.metadata !== undefined ? {
        ...(originalHazard.metadata || {}),
        ...updatedHazard.metadata,
        description: updatedHazard.metadata.descriptionRaw !== undefined
            ? deserializeLocalizedString(updatedHazard.metadata.description, updatedHazard.metadata.descriptionRaw)
            : updatedHazard.metadata.description || ((_a = originalHazard.metadata) === null || _a === void 0 ? void 0 : _a.description) || originalHazard.summary,
        precautions: (updatedHazard.metadata.precautionsRaw || updatedHazard.metadata.precautions) !== undefined
            ? (updatedHazard.metadata.precautionsRaw || updatedHazard.metadata.precautions).map((p) => {
                if (typeof p === 'object' && p !== null && !Array.isArray(p)) {
                    return p;
                }
                return typeof p === 'string' ? { en: p, zh: p } : p;
            })
            : updatedHazard.metadata.precautions || ((_b = originalHazard.metadata) === null || _b === void 0 ? void 0 : _b.precautions) || originalHazard.mitigations,
    } : originalHazard.metadata;
    return {
        ...originalHazard,
        zoneId: updatedHazard.zoneId !== undefined ? updatedHazard.zoneId : originalHazard.zoneId,
        level: updatedHazard.level !== undefined ? updatedHazard.level : originalHazard.level,
        seasons: updatedHazard.seasons !== undefined ? updatedHazard.seasons : originalHazard.seasons,
        type: updatedHazard.type || originalHazard.type,
        severity: updatedHazard.severity || originalHazard.severity,
        summary: deserializeLocalizedString(updatedHazard.summary, updatedHazard.summaryRaw) || originalHazard.summary,
        mitigations: (updatedHazard.mitigationsRaw || updatedHazard.mitigations) !== undefined
            ? (updatedHazard.mitigationsRaw || updatedHazard.mitigations).map((m) => {
                if (typeof m === 'object' && m !== null && !Array.isArray(m)) {
                    return m;
                }
                return typeof m === 'string' ? { en: m, zh: m } : m;
            })
            : originalHazard.mitigations,
        metadata,
    };
}
function deserializeLocalizedString(serializedValue, rawValue) {
    if (rawValue !== undefined) {
        return rawValue;
    }
    if (serializedValue !== undefined) {
        if (typeof serializedValue === 'object' && serializedValue !== null) {
            return serializedValue;
        }
        return { en: serializedValue, zh: serializedValue };
    }
    return undefined;
}
//# sourceMappingURL=pack-deserializer.util.js.map