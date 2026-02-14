"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKILL_CLASS_KEY = exports.SKILL_METADATA_KEY = void 0;
exports.Skill = Skill;
exports.getSkillMetadata = getSkillMetadata;
require("reflect-metadata");
exports.SKILL_METADATA_KEY = Symbol('skill:metadata');
exports.SKILL_CLASS_KEY = Symbol('skill:class');
function Skill(options) {
    return function (target) {
        Reflect.defineMetadata(exports.SKILL_METADATA_KEY, options, target);
        Reflect.defineMetadata(exports.SKILL_CLASS_KEY, target, target);
        return target;
    };
}
function getSkillMetadata(target) {
    return Reflect.getMetadata(exports.SKILL_METADATA_KEY, target);
}
//# sourceMappingURL=skill.decorator.js.map