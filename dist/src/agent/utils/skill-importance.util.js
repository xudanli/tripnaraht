"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSkillImportance = getSkillImportance;
exports.isCriticalSkill = isCriticalSkill;
exports.isImportantSkill = isImportantSkill;
exports.isOptionalSkill = isOptionalSkill;
exports.getSkillFailureStrategy = getSkillFailureStrategy;
const SKILL_IMPORTANCE_MAP = {
    'transport.search': 'CRITICAL',
    'itinerary.generate': 'CRITICAL',
    'poi.search': 'IMPORTANT',
    'opening_hours.get': 'IMPORTANT',
    'itinerary.verify': 'IMPORTANT',
    'gatekeeper.evaluate': 'IMPORTANT',
    'dem.get.profile': 'OPTIONAL',
    'geo.check.hazard.zones': 'OPTIONAL',
    'repair.apply': 'OPTIONAL',
};
function getSkillImportance(skillName) {
    return SKILL_IMPORTANCE_MAP[skillName] || 'OPTIONAL';
}
function isCriticalSkill(skillName) {
    return getSkillImportance(skillName) === 'CRITICAL';
}
function isImportantSkill(skillName) {
    return getSkillImportance(skillName) === 'IMPORTANT';
}
function isOptionalSkill(skillName) {
    return getSkillImportance(skillName) === 'OPTIONAL';
}
function getSkillFailureStrategy(skillName, error) {
    var _a, _b, _c, _d;
    const importance = getSkillImportance(skillName);
    const isDependencyMissing = ((_a = error === null || error === void 0 ? void 0 : error.message) === null || _a === void 0 ? void 0 : _a.includes('未注入')) ||
        ((_b = error === null || error === void 0 ? void 0 : error.message) === null || _b === void 0 ? void 0 : _b.includes('not injected')) ||
        ((_c = error === null || error === void 0 ? void 0 : error.message) === null || _c === void 0 ? void 0 : _c.includes('未配置')) ||
        ((_d = error === null || error === void 0 ? void 0 : error.message) === null || _d === void 0 ? void 0 : _d.includes('not configured'));
    switch (importance) {
        case 'CRITICAL':
            if (isDependencyMissing) {
                return {
                    shouldReject: false,
                    shouldDegrade: true,
                    shouldMarkMissing: true,
                    shouldIgnore: false,
                    errorMessage: `Critical skill '${skillName}' dependency missing: ${(error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'}`,
                };
            }
            return {
                shouldReject: true,
                shouldDegrade: false,
                shouldMarkMissing: false,
                shouldIgnore: false,
                errorMessage: `Critical skill '${skillName}' failed: ${(error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'}`,
            };
        case 'IMPORTANT':
            return {
                shouldReject: false,
                shouldDegrade: false,
                shouldMarkMissing: true,
                shouldIgnore: false,
                errorMessage: `Important skill '${skillName}' failed, data marked as missing: ${(error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'}`,
            };
        case 'OPTIONAL':
        default:
            return {
                shouldReject: false,
                shouldDegrade: false,
                shouldMarkMissing: false,
                shouldIgnore: true,
                errorMessage: `Optional skill '${skillName}' failed, ignored: ${(error === null || error === void 0 ? void 0 : error.message) || 'Unknown error'}`,
            };
    }
}
//# sourceMappingURL=skill-importance.util.js.map