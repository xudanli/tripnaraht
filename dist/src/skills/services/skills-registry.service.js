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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SkillsRegistryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillsRegistryService = void 0;
const common_1 = require("@nestjs/common");
const skills_tokens_1 = require("../skills.tokens");
let SkillsRegistryService = SkillsRegistryService_1 = class SkillsRegistryService {
    constructor(demGetProfile, worldBuildContext, decisionAbuCheck, decisionDrdrePace, decisionNeptuneRepair, decisionRunThreeGuardians, decisionExplainForHuman, routeDirectionPickForIntent, routeDirectionListForCountry, readinessGenerateChecklist, readinessSummarizeRisks, readinessCheckVisaWindow, tripQuickEvaluate, countryPackNewSkeleton, countryPackValidate, countryPackGenerateRegressionTests, countryPackSuggestImprovements, countryPackGetBlocks, countryPackRankBlocks, contextBuild, contextCompress, contextEvaluate, contextRegressionTests, planSelectSlices, contextLearn, toolsSelect, decisionLogAppend) {
        this.demGetProfile = demGetProfile;
        this.worldBuildContext = worldBuildContext;
        this.decisionAbuCheck = decisionAbuCheck;
        this.decisionDrdrePace = decisionDrdrePace;
        this.decisionNeptuneRepair = decisionNeptuneRepair;
        this.decisionRunThreeGuardians = decisionRunThreeGuardians;
        this.decisionExplainForHuman = decisionExplainForHuman;
        this.routeDirectionPickForIntent = routeDirectionPickForIntent;
        this.routeDirectionListForCountry = routeDirectionListForCountry;
        this.readinessGenerateChecklist = readinessGenerateChecklist;
        this.readinessSummarizeRisks = readinessSummarizeRisks;
        this.readinessCheckVisaWindow = readinessCheckVisaWindow;
        this.tripQuickEvaluate = tripQuickEvaluate;
        this.countryPackNewSkeleton = countryPackNewSkeleton;
        this.countryPackValidate = countryPackValidate;
        this.countryPackGenerateRegressionTests = countryPackGenerateRegressionTests;
        this.countryPackSuggestImprovements = countryPackSuggestImprovements;
        this.countryPackGetBlocks = countryPackGetBlocks;
        this.countryPackRankBlocks = countryPackRankBlocks;
        this.contextBuild = contextBuild;
        this.contextCompress = contextCompress;
        this.contextEvaluate = contextEvaluate;
        this.contextRegressionTests = contextRegressionTests;
        this.planSelectSlices = planSelectSlices;
        this.contextLearn = contextLearn;
        this.toolsSelect = toolsSelect;
        this.decisionLogAppend = decisionLogAppend;
        this.skills = new Map();
        this.logger = new common_1.Logger(SkillsRegistryService_1.name);
        this.logger.log('[SkillsRegistryService] 构造函数开始执行...');
        this.logger.debug('[SkillsRegistryService] 开始注册 Skills...');
        if (this.demGetProfile)
            this.registerSkill(this.demGetProfile);
        if (this.worldBuildContext)
            this.registerSkill(this.worldBuildContext);
        if (this.decisionAbuCheck)
            this.registerSkill(this.decisionAbuCheck);
        if (this.decisionDrdrePace)
            this.registerSkill(this.decisionDrdrePace);
        if (this.decisionNeptuneRepair)
            this.registerSkill(this.decisionNeptuneRepair);
        if (this.decisionRunThreeGuardians)
            this.registerSkill(this.decisionRunThreeGuardians);
        if (this.decisionExplainForHuman)
            this.registerSkill(this.decisionExplainForHuman);
        if (this.routeDirectionPickForIntent)
            this.registerSkill(this.routeDirectionPickForIntent);
        if (this.routeDirectionListForCountry)
            this.registerSkill(this.routeDirectionListForCountry);
        if (this.readinessGenerateChecklist)
            this.registerSkill(this.readinessGenerateChecklist);
        if (this.readinessSummarizeRisks)
            this.registerSkill(this.readinessSummarizeRisks);
        if (this.readinessCheckVisaWindow)
            this.registerSkill(this.readinessCheckVisaWindow);
        if (this.tripQuickEvaluate)
            this.registerSkill(this.tripQuickEvaluate);
        if (this.countryPackNewSkeleton)
            this.registerSkill(this.countryPackNewSkeleton);
        if (this.countryPackValidate)
            this.registerSkill(this.countryPackValidate);
        if (this.countryPackGenerateRegressionTests)
            this.registerSkill(this.countryPackGenerateRegressionTests);
        if (this.countryPackSuggestImprovements)
            this.registerSkill(this.countryPackSuggestImprovements);
        if (this.countryPackGetBlocks)
            this.registerSkill(this.countryPackGetBlocks);
        if (this.countryPackRankBlocks)
            this.registerSkill(this.countryPackRankBlocks);
        if (this.contextBuild)
            this.registerSkill(this.contextBuild);
        if (this.contextCompress)
            this.registerSkill(this.contextCompress);
        if (this.contextEvaluate)
            this.registerSkill(this.contextEvaluate);
        if (this.contextRegressionTests)
            this.registerSkill(this.contextRegressionTests);
        if (this.planSelectSlices)
            this.registerSkill(this.planSelectSlices);
        if (this.contextLearn)
            this.registerSkill(this.contextLearn);
        if (this.toolsSelect)
            this.registerSkill(this.toolsSelect);
        if (this.decisionLogAppend)
            this.registerSkill(this.decisionLogAppend);
        this.logger.log(`[SkillsRegistryService] 构造函数完成，已注册 ${this.skills.size} 个 Skills`);
    }
    registerSkill(skill) {
        if (!skill || !skill.metadata) {
            return;
        }
        this.skills.set(skill.metadata.name, skill);
    }
    getSkill(name) {
        return this.skills.get(name);
    }
    hasSkill(name) {
        return this.skills.has(name);
    }
    getAllSkills() {
        return Array.from(this.skills.values());
    }
    getAllSkillMetadata() {
        return Array.from(this.skills.values()).map(skill => skill.metadata);
    }
};
exports.SkillsRegistryService = SkillsRegistryService;
exports.SkillsRegistryService = SkillsRegistryService = SkillsRegistryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)(skills_tokens_1.SKILL_DEM_GET_PROFILE)),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(skills_tokens_1.SKILL_WORLD_BUILD_CONTEXT)),
    __param(2, (0, common_1.Optional)()),
    __param(2, (0, common_1.Inject)(skills_tokens_1.SKILL_DECISION_ABU_CHECK)),
    __param(3, (0, common_1.Optional)()),
    __param(3, (0, common_1.Inject)(skills_tokens_1.SKILL_DECISION_DRDRE_PACE)),
    __param(4, (0, common_1.Optional)()),
    __param(4, (0, common_1.Inject)(skills_tokens_1.SKILL_DECISION_NEPTUNE_REPAIR)),
    __param(5, (0, common_1.Optional)()),
    __param(5, (0, common_1.Inject)(skills_tokens_1.SKILL_DECISION_RUN_THREE_GUARDIANS)),
    __param(6, (0, common_1.Optional)()),
    __param(6, (0, common_1.Inject)(skills_tokens_1.SKILL_DECISION_EXPLAIN_FOR_HUMAN)),
    __param(7, (0, common_1.Optional)()),
    __param(7, (0, common_1.Inject)(skills_tokens_1.SKILL_ROUTE_DIRECTION_PICK_FOR_INTENT)),
    __param(8, (0, common_1.Optional)()),
    __param(8, (0, common_1.Inject)(skills_tokens_1.SKILL_ROUTE_DIRECTION_LIST_FOR_COUNTRY)),
    __param(9, (0, common_1.Optional)()),
    __param(9, (0, common_1.Inject)(skills_tokens_1.SKILL_READINESS_GENERATE_CHECKLIST)),
    __param(10, (0, common_1.Optional)()),
    __param(10, (0, common_1.Inject)(skills_tokens_1.SKILL_READINESS_SUMMARIZE_RISKS)),
    __param(11, (0, common_1.Optional)()),
    __param(11, (0, common_1.Inject)(skills_tokens_1.SKILL_READINESS_CHECK_VISA_WINDOW)),
    __param(12, (0, common_1.Optional)()),
    __param(12, (0, common_1.Inject)(skills_tokens_1.SKILL_TRIP_QUICK_EVALUATE)),
    __param(13, (0, common_1.Optional)()),
    __param(13, (0, common_1.Inject)(skills_tokens_1.SKILL_COUNTRY_PACK_NEW_SKELETON)),
    __param(14, (0, common_1.Optional)()),
    __param(14, (0, common_1.Inject)(skills_tokens_1.SKILL_COUNTRY_PACK_VALIDATE)),
    __param(15, (0, common_1.Optional)()),
    __param(15, (0, common_1.Inject)(skills_tokens_1.SKILL_COUNTRY_PACK_GENERATE_REGRESSION_TESTS)),
    __param(16, (0, common_1.Optional)()),
    __param(16, (0, common_1.Inject)(skills_tokens_1.SKILL_COUNTRY_PACK_SUGGEST_IMPROVEMENTS)),
    __param(17, (0, common_1.Optional)()),
    __param(17, (0, common_1.Inject)(skills_tokens_1.SKILL_COUNTRY_PACK_GET_BLOCKS)),
    __param(18, (0, common_1.Optional)()),
    __param(18, (0, common_1.Inject)(skills_tokens_1.SKILL_COUNTRY_PACK_RANK_BLOCKS)),
    __param(19, (0, common_1.Optional)()),
    __param(19, (0, common_1.Inject)(skills_tokens_1.SKILL_CONTEXT_BUILD)),
    __param(20, (0, common_1.Optional)()),
    __param(20, (0, common_1.Inject)(skills_tokens_1.SKILL_CONTEXT_COMPRESS)),
    __param(21, (0, common_1.Optional)()),
    __param(21, (0, common_1.Inject)(skills_tokens_1.SKILL_CONTEXT_EVALUATE)),
    __param(22, (0, common_1.Optional)()),
    __param(22, (0, common_1.Inject)(skills_tokens_1.SKILL_CONTEXT_REGRESSION_TESTS)),
    __param(23, (0, common_1.Optional)()),
    __param(23, (0, common_1.Inject)(skills_tokens_1.SKILL_PLAN_SELECT_SLICES)),
    __param(24, (0, common_1.Optional)()),
    __param(24, (0, common_1.Inject)(skills_tokens_1.SKILL_CONTEXT_LEARN)),
    __param(25, (0, common_1.Optional)()),
    __param(25, (0, common_1.Inject)(skills_tokens_1.SKILL_TOOLS_SELECT)),
    __param(26, (0, common_1.Optional)()),
    __param(26, (0, common_1.Inject)(skills_tokens_1.SKILL_DECISION_LOG_APPEND)),
    __metadata("design:paramtypes", [Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object, Object])
], SkillsRegistryService);
//# sourceMappingURL=skills-registry.service.js.map