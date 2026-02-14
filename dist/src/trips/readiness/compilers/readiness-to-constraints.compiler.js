"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessToConstraintsCompiler = void 0;
const common_1 = require("@nestjs/common");
const i18n_utils_1 = require("../utils/i18n.utils");
let ReadinessToConstraintsCompiler = class ReadinessToConstraintsCompiler {
    compile(result) {
        var _a, _b, _c, _d, _e, _f, _g;
        const constraints = [];
        for (const finding of result.findings) {
            for (const item of finding.blockers) {
                const constraintType = item.category === 'entry_transit' || item.category === 'health_insurance'
                    ? 'legal_blocker'
                    : 'safety_blocker';
                constraints.push({
                    id: `readiness.blocker.${item.id}`,
                    type: 'hard',
                    severity: 'error',
                    constraintType,
                    message: item.message,
                    evidence: item.evidence,
                    tasks: (_a = item.tasks) === null || _a === void 0 ? void 0 : _a.map(task => ({
                        title: typeof task.title === 'string' ? task.title : (0, i18n_utils_1.getLocalizedText)(task.title),
                        dueOffsetDays: task.dueOffsetDays,
                        tags: task.tags,
                    })),
                    askUser: Array.isArray(item.askUser) && item.askUser.length > 0 && typeof item.askUser[0] === 'string'
                        ? item.askUser
                        : ((_b = item.askUser) === null || _b === void 0 ? void 0 : _b.map(q => { var _a, _b; return typeof q === 'string' ? q : (typeof q.text === 'string' ? q.text : (((_a = q.text) === null || _a === void 0 ? void 0 : _a.zh) || ((_b = q.text) === null || _b === void 0 ? void 0 : _b.en) || '')); })) || [],
                });
            }
            for (const item of finding.must) {
                constraints.push({
                    id: `readiness.must.${item.id}`,
                    type: 'hard',
                    severity: 'error',
                    constraintType: 'strong_recommendation',
                    message: item.message,
                    evidence: item.evidence,
                    tasks: (_c = item.tasks) === null || _c === void 0 ? void 0 : _c.map(task => ({
                        title: typeof task.title === 'string' ? task.title : (0, i18n_utils_1.getLocalizedText)(task.title),
                        dueOffsetDays: task.dueOffsetDays,
                        tags: task.tags,
                    })),
                    askUser: Array.isArray(item.askUser) && item.askUser.length > 0 && typeof item.askUser[0] === 'string'
                        ? item.askUser
                        : ((_d = item.askUser) === null || _d === void 0 ? void 0 : _d.map(q => { var _a, _b; return typeof q === 'string' ? q : (typeof q.text === 'string' ? q.text : (((_a = q.text) === null || _a === void 0 ? void 0 : _a.zh) || ((_b = q.text) === null || _b === void 0 ? void 0 : _b.en) || '')); })) || [],
                });
            }
            for (const item of finding.should) {
                constraints.push({
                    id: `readiness.should.${item.id}`,
                    type: 'soft',
                    severity: 'warning',
                    constraintType: 'recommendation',
                    message: item.message,
                    evidence: item.evidence,
                    tasks: (_e = item.tasks) === null || _e === void 0 ? void 0 : _e.map(task => ({
                        title: typeof task.title === 'string' ? task.title : (0, i18n_utils_1.getLocalizedText)(task.title),
                        dueOffsetDays: task.dueOffsetDays,
                        tags: task.tags,
                    })),
                    askUser: Array.isArray(item.askUser) && item.askUser.length > 0 && typeof item.askUser[0] === 'string'
                        ? item.askUser
                        : ((_f = item.askUser) === null || _f === void 0 ? void 0 : _f.map(q => { var _a, _b; return typeof q === 'string' ? q : (typeof q.text === 'string' ? q.text : (((_a = q.text) === null || _a === void 0 ? void 0 : _a.zh) || ((_b = q.text) === null || _b === void 0 ? void 0 : _b.en) || '')); })) || [],
                    penalty: () => item.severity === 'high' ? 0.3 : 0.1,
                });
            }
            for (const item of finding.optional) {
                constraints.push({
                    id: `readiness.optional.${item.id}`,
                    type: 'soft',
                    severity: 'info',
                    constraintType: 'optional',
                    message: item.message,
                    evidence: item.evidence,
                    tasks: (_g = item.tasks) === null || _g === void 0 ? void 0 : _g.map(task => ({
                        title: typeof task.title === 'string' ? task.title : (0, i18n_utils_1.getLocalizedText)(task.title),
                        dueOffsetDays: task.dueOffsetDays,
                        tags: task.tags,
                    })),
                });
            }
        }
        return constraints;
    }
    toConstraintViolations(result) {
        const violations = [];
        for (const finding of result.findings) {
            for (const item of [...finding.blockers, ...finding.must]) {
                violations.push({
                    code: `READINESS_${item.category.toUpperCase()}_${item.id}`,
                    details: {
                        destinationId: finding.destinationId,
                        category: item.category,
                        severity: item.severity,
                        message: item.message,
                        evidence: item.evidence,
                    },
                });
            }
        }
        return violations;
    }
    toCheckerViolations(result, date) {
        var _a, _b;
        const violations = [];
        for (const finding of result.findings) {
            for (const item of [...finding.blockers, ...finding.must]) {
                violations.push({
                    code: `READINESS_${item.category.toUpperCase()}`,
                    severity: 'error',
                    date,
                    message: item.message,
                    details: {
                        destinationId: finding.destinationId,
                        category: item.category,
                        ruleId: item.id,
                        evidence: item.evidence,
                    },
                    suggestions: ((_a = item.tasks) === null || _a === void 0 ? void 0 : _a.map(t => typeof t.title === 'string' ? t.title : (0, i18n_utils_1.getLocalizedText)(t.title))) || [],
                });
            }
            for (const item of finding.should) {
                violations.push({
                    code: `READINESS_${item.category.toUpperCase()}`,
                    severity: 'warning',
                    date,
                    message: item.message,
                    details: {
                        destinationId: finding.destinationId,
                        category: item.category,
                        ruleId: item.id,
                    },
                    suggestions: ((_b = item.tasks) === null || _b === void 0 ? void 0 : _b.map(t => typeof t.title === 'string' ? t.title : (0, i18n_utils_1.getLocalizedText)(t.title))) || [],
                });
            }
            for (const item of finding.optional) {
                violations.push({
                    code: `READINESS_${item.category.toUpperCase()}`,
                    severity: 'info',
                    date,
                    message: item.message,
                    details: {
                        destinationId: finding.destinationId,
                        category: item.category,
                        ruleId: item.id,
                    },
                });
            }
        }
        return violations;
    }
    extractTasks(result) {
        const tasks = [];
        for (const finding of result.findings) {
            for (const item of [...finding.blockers, ...finding.must, ...finding.should]) {
                if (item.tasks) {
                    for (const task of item.tasks) {
                        tasks.push({
                            title: typeof task.title === 'string' ? task.title : (0, i18n_utils_1.getLocalizedText)(task.title),
                            dueOffsetDays: task.dueOffsetDays || 0,
                            tags: task.tags || [],
                            destinationId: finding.destinationId,
                            category: item.category,
                        });
                    }
                }
            }
        }
        tasks.sort((a, b) => a.dueOffsetDays - b.dueOffsetDays);
        return tasks;
    }
};
exports.ReadinessToConstraintsCompiler = ReadinessToConstraintsCompiler;
exports.ReadinessToConstraintsCompiler = ReadinessToConstraintsCompiler = __decorate([
    (0, common_1.Injectable)()
], ReadinessToConstraintsCompiler);
//# sourceMappingURL=readiness-to-constraints.compiler.js.map