"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PackValidatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackValidatorService = void 0;
const common_1 = require("@nestjs/common");
const pack_storage_service_1 = require("./pack-storage.service");
let PackValidatorService = PackValidatorService_1 = class PackValidatorService {
    constructor(packStorage) {
        this.packStorage = packStorage;
        this.logger = new common_1.Logger(PackValidatorService_1.name);
    }
    validate(pack) {
        const errors = [];
        const warnings = [];
        this.validateBasicStructure(pack, errors, warnings);
        this.validateRules(pack, errors, warnings);
        this.validateChecklists(pack, errors, warnings);
        this.validateHazards(pack, errors, warnings);
        this.validateGeo(pack, errors, warnings);
        return {
            valid: errors.length === 0,
            errors,
            warnings,
        };
    }
    validateBasicStructure(pack, errors, warnings) {
        if (!pack.packId) {
            errors.push({ path: 'packId', message: 'packId is required', code: 'MISSING_FIELD' });
        }
        else if (!/^pack\.[a-z0-9.-]+$/.test(pack.packId)) {
            errors.push({
                path: 'packId',
                message: 'packId must follow format: pack.{country}.{region}.{city}',
                code: 'INVALID_FORMAT',
            });
        }
        if (!pack.destinationId) {
            errors.push({ path: 'destinationId', message: 'destinationId is required', code: 'MISSING_FIELD' });
        }
        if (!pack.version) {
            errors.push({ path: 'version', message: 'version is required', code: 'MISSING_FIELD' });
        }
        else if (!/^\d+\.\d+\.\d+$/.test(pack.version)) {
            errors.push({
                path: 'version',
                message: 'version must follow semantic versioning (e.g., 1.0.0)',
                code: 'INVALID_VERSION',
            });
        }
        if (!pack.lastReviewedAt) {
            errors.push({ path: 'lastReviewedAt', message: 'lastReviewedAt is required', code: 'MISSING_FIELD' });
        }
        else {
            try {
                const date = new Date(pack.lastReviewedAt);
                if (isNaN(date.getTime())) {
                    errors.push({
                        path: 'lastReviewedAt',
                        message: 'lastReviewedAt must be a valid ISO datetime',
                        code: 'INVALID_DATE',
                    });
                }
            }
            catch {
                errors.push({
                    path: 'lastReviewedAt',
                    message: 'lastReviewedAt must be a valid ISO datetime',
                    code: 'INVALID_DATE',
                });
            }
        }
        if (!pack.supportedSeasons || pack.supportedSeasons.length === 0) {
            warnings.push({
                path: 'supportedSeasons',
                message: 'supportedSeasons is empty, consider adding at least one season',
                code: 'EMPTY_SEASONS',
            });
        }
    }
    validateRules(pack, errors, warnings) {
        if (!pack.rules || pack.rules.length === 0) {
            errors.push({
                path: 'rules',
                message: 'At least one rule is required',
                code: 'EMPTY_RULES',
            });
            return;
        }
        pack.rules.forEach((rule, index) => {
            const basePath = `rules[${index}]`;
            if (!rule.id) {
                errors.push({ path: `${basePath}.id`, message: 'Rule id is required', code: 'MISSING_FIELD' });
            }
            if (!rule.category) {
                errors.push({ path: `${basePath}.category`, message: 'Rule category is required', code: 'MISSING_FIELD' });
            }
            if (!rule.when) {
                errors.push({ path: `${basePath}.when`, message: 'Rule when condition is required', code: 'MISSING_FIELD' });
            }
            else {
                this.validateCondition(rule.when, `${basePath}.when`, errors);
            }
            if (!rule.then) {
                errors.push({ path: `${basePath}.then`, message: 'Rule then action is required', code: 'MISSING_FIELD' });
            }
            else {
                if (!rule.then.level) {
                    errors.push({
                        path: `${basePath}.then.level`,
                        message: 'Action level is required',
                        code: 'MISSING_FIELD',
                    });
                }
                if (!rule.then.message) {
                    errors.push({
                        path: `${basePath}.then.message`,
                        message: 'Action message is required',
                        code: 'MISSING_FIELD',
                    });
                }
                if (rule.then.userDecision) {
                    this.validateUserDecision(rule.then.userDecision, `${basePath}.then.userDecision`, errors, warnings);
                }
            }
            if (!rule.evidence || rule.evidence.length === 0) {
                warnings.push({
                    path: `${basePath}.evidence`,
                    message: 'Rule has no evidence, consider adding source references',
                    code: 'NO_EVIDENCE',
                });
            }
        });
    }
    validateCondition(condition, path, errors) {
        const keys = Object.keys(condition);
        const validKeys = ['all', 'any', 'not', 'exists', 'eq', 'in', 'containsAny'];
        if (keys.length === 0) {
            errors.push({ path, message: 'Condition cannot be empty', code: 'EMPTY_CONDITION' });
            return;
        }
        const hasValidKey = keys.some(k => validKeys.includes(k));
        if (!hasValidKey) {
            errors.push({
                path,
                message: `Condition must contain one of: ${validKeys.join(', ')}`,
                code: 'INVALID_CONDITION',
            });
        }
        if (condition.all && Array.isArray(condition.all)) {
            condition.all.forEach((c, i) => {
                this.validateCondition(c, `${path}.all[${i}]`, errors);
            });
        }
        if (condition.any && Array.isArray(condition.any)) {
            condition.any.forEach((c, i) => {
                this.validateCondition(c, `${path}.any[${i}]`, errors);
            });
        }
        if (condition.not) {
            this.validateCondition(condition.not, `${path}.not`, errors);
        }
        if (condition.eq) {
            if (!condition.eq.path) {
                errors.push({ path: `${path}.eq.path`, message: 'eq.path is required', code: 'MISSING_FIELD' });
            }
        }
        if (condition.in) {
            if (!condition.in.path) {
                errors.push({ path: `${path}.in.path`, message: 'in.path is required', code: 'MISSING_FIELD' });
            }
            if (!Array.isArray(condition.in.values)) {
                errors.push({ path: `${path}.in.values`, message: 'in.values must be an array', code: 'INVALID_TYPE' });
            }
        }
        if (condition.containsAny) {
            if (!condition.containsAny.path) {
                errors.push({
                    path: `${path}.containsAny.path`,
                    message: 'containsAny.path is required',
                    code: 'MISSING_FIELD',
                });
            }
            if (!Array.isArray(condition.containsAny.values)) {
                errors.push({
                    path: `${path}.containsAny.values`,
                    message: 'containsAny.values must be an array',
                    code: 'INVALID_TYPE',
                });
            }
        }
    }
    validateChecklists(pack, errors, warnings) {
        if (!pack.checklists || pack.checklists.length === 0) {
            warnings.push({
                path: 'checklists',
                message: 'No checklists provided, consider adding at least one',
                code: 'EMPTY_CHECKLISTS',
            });
            return;
        }
        pack.checklists.forEach((checklist, index) => {
            const basePath = `checklists[${index}]`;
            if (!checklist.id) {
                errors.push({ path: `${basePath}.id`, message: 'Checklist id is required', code: 'MISSING_FIELD' });
            }
            if (!checklist.category) {
                errors.push({ path: `${basePath}.category`, message: 'Checklist category is required', code: 'MISSING_FIELD' });
            }
            if (!checklist.items || checklist.items.length === 0) {
                errors.push({
                    path: `${basePath}.items`,
                    message: 'Checklist items cannot be empty',
                    code: 'EMPTY_ITEMS',
                });
            }
        });
    }
    validateHazards(pack, errors, warnings) {
        if (!pack.hazards || pack.hazards.length === 0) {
            warnings.push({
                path: 'hazards',
                message: 'No hazards provided, consider adding known risks',
                code: 'EMPTY_HAZARDS',
            });
            return;
        }
        pack.hazards.forEach((hazard, index) => {
            const basePath = `hazards[${index}]`;
            if (!hazard.type) {
                errors.push({ path: `${basePath}.type`, message: 'Hazard type is required', code: 'MISSING_FIELD' });
            }
            if (!hazard.severity) {
                errors.push({ path: `${basePath}.severity`, message: 'Hazard severity is required', code: 'MISSING_FIELD' });
            }
            if (!hazard.summary) {
                errors.push({ path: `${basePath}.summary`, message: 'Hazard summary is required', code: 'MISSING_FIELD' });
            }
            if (!hazard.mitigations || hazard.mitigations.length === 0) {
                warnings.push({
                    path: `${basePath}.mitigations`,
                    message: 'Hazard has no mitigations, consider adding mitigation strategies',
                    code: 'NO_MITIGATIONS',
                });
            }
        });
    }
    validateGeo(pack, errors, warnings) {
        if (!pack.geo) {
            errors.push({ path: 'geo', message: 'geo is required', code: 'MISSING_FIELD' });
            return;
        }
        if (!pack.geo.countryCode) {
            errors.push({ path: 'geo.countryCode', message: 'geo.countryCode is required', code: 'MISSING_FIELD' });
        }
        else if (!/^[A-Z]{2}$/.test(pack.geo.countryCode)) {
            errors.push({
                path: 'geo.countryCode',
                message: 'countryCode must be a 2-letter ISO code',
                code: 'INVALID_FORMAT',
            });
        }
        if (pack.geo.lat !== undefined) {
            if (pack.geo.lat < -90 || pack.geo.lat > 90) {
                errors.push({
                    path: 'geo.lat',
                    message: 'latitude must be between -90 and 90',
                    code: 'INVALID_RANGE',
                });
            }
        }
        if (pack.geo.lng !== undefined) {
            if (pack.geo.lng < -180 || pack.geo.lng > 180) {
                errors.push({
                    path: 'geo.lng',
                    message: 'longitude must be between -180 and 180',
                    code: 'INVALID_RANGE',
                });
            }
        }
    }
    validateUserDecision(userDecision, path, errors, warnings) {
        if (!userDecision.questions || userDecision.questions.length === 0) {
            errors.push({
                path: `${path}.questions`,
                message: 'userDecision.questions is required and cannot be empty',
                code: 'MISSING_FIELD',
            });
            return;
        }
        userDecision.questions.forEach((question, index) => {
            var _a, _b;
            const questionPath = `${path}.questions[${index}]`;
            if (!question.id) {
                errors.push({
                    path: `${questionPath}.id`,
                    message: 'Question id is required',
                    code: 'MISSING_FIELD',
                });
            }
            if (!question.type) {
                errors.push({
                    path: `${questionPath}.type`,
                    message: 'Question type is required',
                    code: 'MISSING_FIELD',
                });
            }
            else {
                const validTypes = ['yes_no', 'single_choice', 'multiple_choice', 'text', 'number', 'date', 'rating'];
                if (!validTypes.includes(question.type)) {
                    errors.push({
                        path: `${questionPath}.type`,
                        message: `Question type must be one of: ${validTypes.join(', ')}`,
                        code: 'INVALID_TYPE',
                    });
                }
            }
            if (!question.question) {
                errors.push({
                    path: `${questionPath}.question`,
                    message: 'Question text is required',
                    code: 'MISSING_FIELD',
                });
            }
            if (question.type === 'single_choice' || question.type === 'multiple_choice') {
                if (!question.options || question.options.length === 0) {
                    errors.push({
                        path: `${questionPath}.options`,
                        message: 'Options are required for single_choice and multiple_choice questions',
                        code: 'MISSING_FIELD',
                    });
                }
                else if (question.options.length > 10) {
                    warnings.push({
                        path: `${questionPath}.options`,
                        message: 'Too many options (>10), consider reducing to avoid choice overload',
                        code: 'TOO_MANY_OPTIONS',
                    });
                }
            }
            if (question.type === 'rating') {
                if (((_a = question.validation) === null || _a === void 0 ? void 0 : _a.min) !== undefined && ((_b = question.validation) === null || _b === void 0 ? void 0 : _b.max) !== undefined) {
                    if (question.validation.min >= question.validation.max) {
                        errors.push({
                            path: `${questionPath}.validation.min`,
                            message: 'rating min must be less than max',
                            code: 'INVALID_RANGE',
                        });
                    }
                }
            }
        });
        if (userDecision.branches && userDecision.branches.length > 0) {
            userDecision.branches.forEach((branch, index) => {
                const branchPath = `${path}.branches[${index}]`;
                this.validateDecisionBranch(branch, branchPath, userDecision.questions, errors, warnings);
            });
        }
        if (userDecision.defaultBranch) {
            if (!userDecision.branches || userDecision.branches.length === 0) {
                warnings.push({
                    path: `${path}.defaultBranch`,
                    message: 'defaultBranch is provided but no branches exist, defaultBranch will always be used',
                    code: 'UNNECESSARY_DEFAULT_BRANCH',
                });
            }
        }
        else if (userDecision.branches && userDecision.branches.length > 0) {
            warnings.push({
                path: `${path}.defaultBranch`,
                message: 'branches exist but no defaultBranch, if no branch matches, original action will be used',
                code: 'MISSING_DEFAULT_BRANCH',
            });
        }
    }
    validateDecisionBranch(branch, path, questions, errors, warnings) {
        if (!branch.condition) {
            errors.push({
                path: `${path}.condition`,
                message: 'Branch condition is required',
                code: 'MISSING_FIELD',
            });
            return;
        }
        const { questionId, operator, value } = branch.condition;
        if (!questionId) {
            errors.push({
                path: `${path}.condition.questionId`,
                message: 'condition.questionId is required',
                code: 'MISSING_FIELD',
            });
        }
        else {
            const questionExists = questions.some(q => q.id === questionId);
            if (!questionExists) {
                errors.push({
                    path: `${path}.condition.questionId`,
                    message: `questionId "${questionId}" does not exist in questions`,
                    code: 'INVALID_QUESTION_ID',
                });
            }
        }
        if (!operator) {
            errors.push({
                path: `${path}.condition.operator`,
                message: 'condition.operator is required',
                code: 'MISSING_FIELD',
            });
        }
        else {
            const validOperators = ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'in', 'not_in'];
            if (!validOperators.includes(operator)) {
                errors.push({
                    path: `${path}.condition.operator`,
                    message: `operator must be one of: ${validOperators.join(', ')}`,
                    code: 'INVALID_OPERATOR',
                });
            }
        }
        if (value === undefined) {
            errors.push({
                path: `${path}.condition.value`,
                message: 'condition.value is required',
                code: 'MISSING_FIELD',
            });
        }
        if (!branch.then) {
            errors.push({
                path: `${path}.then`,
                message: 'Branch then action is required',
                code: 'MISSING_FIELD',
            });
        }
        else {
            if (branch.then.level) {
                const validLevels = ['blocker', 'must', 'should', 'optional'];
                if (!validLevels.includes(branch.then.level)) {
                    errors.push({
                        path: `${path}.then.level`,
                        message: `level must be one of: ${validLevels.join(', ')}`,
                        code: 'INVALID_LEVEL',
                    });
                }
            }
            if (branch.then.additionalQuestions) {
                branch.then.additionalQuestions.forEach((question, index) => {
                    const questionPath = `${path}.then.additionalQuestions[${index}]`;
                    if (!question.id) {
                        errors.push({
                            path: `${questionPath}.id`,
                            message: 'Question id is required',
                            code: 'MISSING_FIELD',
                        });
                    }
                    if (!question.type) {
                        errors.push({
                            path: `${questionPath}.type`,
                            message: 'Question type is required',
                            code: 'MISSING_FIELD',
                        });
                    }
                });
            }
        }
    }
};
exports.PackValidatorService = PackValidatorService;
exports.PackValidatorService = PackValidatorService = PackValidatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [pack_storage_service_1.PackStorageService])
], PackValidatorService);
//# sourceMappingURL=pack-validator.service.js.map