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
var SkillScannerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillScannerService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const skill_decorator_1 = require("../decorators/skill.decorator");
const skills_registry_service_1 = require("./skills-registry.service");
let SkillScannerService = SkillScannerService_1 = class SkillScannerService {
    constructor(moduleRef, skillsRegistry) {
        this.moduleRef = moduleRef;
        this.skillsRegistry = skillsRegistry;
        this.logger = new common_1.Logger(SkillScannerService_1.name);
        this.registeredToolNames = new Set();
    }
    async scanAndRegisterSkills(skillClasses) {
        var _a;
        this.logger.log(`[SkillScanner] 开始扫描 ${skillClasses.length} 个 Skill 类...`);
        let registeredCount = 0;
        let skippedCount = 0;
        const pendingRegistrations = [];
        for (const SkillClass of skillClasses) {
            try {
                const metadata = Reflect.getMetadata(skill_decorator_1.SKILL_METADATA_KEY, SkillClass);
                if (!metadata) {
                    this.logger.debug(`跳过 ${SkillClass.name}：未找到 @Skill() 装饰器`);
                    skippedCount++;
                    continue;
                }
                let skillInstance;
                try {
                    skillInstance = this.moduleRef.get(SkillClass, { strict: false });
                }
                catch (error) {
                    this.logger.warn(`无法从容器获取 ${SkillClass.name}，跳过自动注册`);
                    skippedCount++;
                    continue;
                }
                if (!skillInstance || typeof skillInstance.execute !== 'function') {
                    this.logger.warn(`${SkillClass.name} 未实现 Skill 接口，跳过`);
                    skippedCount++;
                    continue;
                }
                if (!skillInstance.metadata) {
                    skillInstance.metadata = metadata;
                }
                const toolName = `tripnara.${metadata.name}`;
                const existingPending = pendingRegistrations.find(r => r.toolName === toolName);
                if (existingPending) {
                    throw new Error(`❌ 命名冲突检测: Skill "${toolName}" 在本次扫描中重复！\n` +
                        `   冲突的类: ${SkillClass.name} vs ${existingPending.className}\n` +
                        `   请检查 Skills 的 name 是否重复。`);
                }
                if (this.skillsRegistry.hasSkill(metadata.name)) {
                    const existingSkill = this.skillsRegistry.getSkill(metadata.name);
                    const existingClassName = existingSkill ? existingSkill.constructor.name : 'unknown';
                    throw new Error(`❌ 命名冲突检测: Skill "${toolName}" 已被手动注册！\n` +
                        `   冲突的类: ${SkillClass.name} vs ${existingClassName}\n` +
                        `   请检查 Skills 的 name 是否重复。`);
                }
                pendingRegistrations.push({
                    skill: skillInstance,
                    className: SkillClass.name,
                    toolName,
                });
            }
            catch (error) {
                if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('命名冲突检测')) {
                    throw error;
                }
                this.logger.error(`注册 ${SkillClass.name} 失败: ${error.message}`, error.stack);
                skippedCount++;
            }
        }
        for (const { skill, className, toolName } of pendingRegistrations) {
            try {
                this.skillsRegistry.registerSkill(skill);
                this.registeredToolNames.add(toolName);
                this.logger.log(`✓ 自动注册: ${skill.metadata.name} (${className})`);
                registeredCount++;
            }
            catch (error) {
                this.logger.error(`注册 ${className} 失败: ${error.message}`, error.stack);
                skippedCount++;
            }
        }
        this.logger.log(`[SkillScanner] 扫描完成: 成功注册 ${registeredCount} 个 Skill，跳过 ${skippedCount} 个`);
    }
    getRegisteredSkillNames() {
        const allSkills = this.skillsRegistry.getAllSkills();
        return allSkills.map(skill => skill.metadata.name);
    }
};
exports.SkillScannerService = SkillScannerService;
exports.SkillScannerService = SkillScannerService = SkillScannerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.ModuleRef,
        skills_registry_service_1.SkillsRegistryService])
], SkillScannerService);
//# sourceMappingURL=skill-scanner.service.js.map