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
var PersonaStateManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersonaStateManagerService = void 0;
const common_1 = require("@nestjs/common");
const multi_persona_manager_service_1 = require("./multi-persona-manager.service");
const persona_identification_service_1 = require("./persona-identification.service");
let PersonaStateManagerService = PersonaStateManagerService_1 = class PersonaStateManagerService {
    constructor(multiPersonaManager, personaIdentification) {
        this.multiPersonaManager = multiPersonaManager;
        this.personaIdentification = personaIdentification;
        this.logger = new common_1.Logger(PersonaStateManagerService_1.name);
        this.personaStates = new Map();
        this.defaultConfig = {
            enableAutoSwitch: true,
            autoSwitchThreshold: 0.7,
            stateTransitionRules: [
                {
                    from: 'INACTIVE',
                    to: 'ACTIVE',
                    conditions: [],
                },
                {
                    from: 'ACTIVE',
                    to: 'SUSPENDED',
                    conditions: [],
                },
                {
                    from: 'SUSPENDED',
                    to: 'ACTIVE',
                    conditions: [],
                },
                {
                    from: 'ACTIVE',
                    to: 'ARCHIVED',
                    conditions: [],
                },
            ],
            statePersistence: {
                enabled: true,
                persistenceInterval: 60000,
            },
        };
        if (this.defaultConfig.statePersistence.enabled) {
            setInterval(() => {
                this.persistStates().catch(err => {
                    this.logger.error(`状态持久化失败: ${err.message}`, err.stack);
                });
            }, this.defaultConfig.statePersistence.persistenceInterval);
        }
    }
    async initializePersonaStates(userId, profile) {
        const userStates = new Map();
        for (const persona of profile.personas) {
            const state = persona.personaName === profile.currentPersona
                ? 'ACTIVE'
                : 'INACTIVE';
            userStates.set(persona.personaName, {
                personaName: persona.personaName,
                state,
                activatedAt: state === 'ACTIVE' ? persona.updatedAt : undefined,
                lastUsedAt: persona.updatedAt,
                switchCount: 0,
                totalUsageTime: 0,
                contextHistory: [],
            });
        }
        this.personaStates.set(userId, userStates);
        this.logger.debug(`初始化用户 ${userId} 的persona状态: ${userStates.size} 个persona`);
    }
    async switchPersona(request) {
        var _a;
        const startTime = Date.now();
        this.logger.log(`切换persona: ${request.userId} ${request.fromPersona} -> ${request.toPersona}`);
        try {
            const profile = await this.multiPersonaManager.getMultiPersonaProfile(request.userId);
            if (!profile) {
                throw new Error(`用户画像不存在: ${request.userId}`);
            }
            const targetPersona = profile.personas.find(p => p.personaName === request.toPersona);
            if (!targetPersona) {
                throw new Error(`Persona不存在: ${request.toPersona}`);
            }
            const userStates = this.personaStates.get(request.userId) || new Map();
            const fromStateInfo = request.fromPersona
                ? userStates.get(request.fromPersona)
                : undefined;
            const toStateInfo = userStates.get(request.toPersona);
            const conflicts = await this.checkSwitchConflicts(request, profile, fromStateInfo, toStateInfo);
            if (conflicts.length > 0 && !request.force) {
                return {
                    success: false,
                    fromPersona: request.fromPersona,
                    toPersona: request.toPersona,
                    switchTime: new Date(),
                    strategy: request.strategy,
                    reason: request.reason,
                    conflicts,
                };
            }
            const transitionSteps = [];
            if (request.fromPersona && fromStateInfo) {
                fromStateInfo.state = 'INACTIVE';
                transitionSteps.push(`停用persona: ${request.fromPersona}`);
            }
            if (toStateInfo) {
                toStateInfo.state = 'ACTIVE';
                toStateInfo.activatedAt = new Date();
                toStateInfo.switchCount += 1;
                if (fromStateInfo) {
                    const usageTime = Date.now() - (((_a = fromStateInfo.activatedAt) === null || _a === void 0 ? void 0 : _a.getTime()) || Date.now());
                    fromStateInfo.totalUsageTime += Math.max(0, usageTime);
                }
                transitionSteps.push(`激活persona: ${request.toPersona}`);
            }
            else {
                const newStateInfo = {
                    personaName: request.toPersona,
                    state: 'ACTIVE',
                    activatedAt: new Date(),
                    lastUsedAt: new Date(),
                    switchCount: 1,
                    totalUsageTime: 0,
                    contextHistory: [],
                };
                userStates.set(request.toPersona, newStateInfo);
                transitionSteps.push(`创建并激活persona: ${request.toPersona}`);
            }
            if (toStateInfo && request.context) {
                toStateInfo.contextHistory.push({
                    timestamp: new Date(),
                    context: request.context,
                    state: 'ACTIVE',
                });
                if (toStateInfo.contextHistory.length > 100) {
                    toStateInfo.contextHistory = toStateInfo.contextHistory.slice(-100);
                }
            }
            profile.currentPersona = request.toPersona;
            targetPersona.usageCount += 1;
            targetPersona.updatedAt = new Date();
            await this.multiPersonaManager.saveMultiPersonaProfile(profile);
            this.personaStates.set(request.userId, userStates);
            const transitionDuration = Date.now() - startTime;
            this.logger.log(`Persona切换成功: ${request.userId} -> ${request.toPersona} (${transitionDuration}ms)`);
            return {
                success: true,
                fromPersona: request.fromPersona,
                toPersona: request.toPersona,
                switchTime: new Date(),
                strategy: request.strategy,
                reason: request.reason || `自动切换: ${request.strategy}`,
                transition: {
                    duration: transitionDuration,
                    steps: transitionSteps,
                },
            };
        }
        catch (error) {
            this.logger.error(`Persona切换失败: ${error.message}`, error.stack);
            return {
                success: false,
                fromPersona: request.fromPersona,
                toPersona: request.toPersona,
                switchTime: new Date(),
                strategy: request.strategy,
                conflicts: [{
                        type: 'PRECONDITION_FAILED',
                        message: error.message,
                    }],
            };
        }
    }
    async autoSwitchPersona(userId, context, strategy = 'AUTO_CONTEXT') {
        this.logger.debug(`自动切换persona: ${userId}, 策略: ${strategy}`);
        const profile = await this.multiPersonaManager.getMultiPersonaProfile(userId);
        if (!profile) {
            return null;
        }
        const { persona: bestPersona, confidence } = await this.personaIdentification.identifyCurrentPersona(profile, context);
        const currentPersona = profile.currentPersona;
        if (currentPersona === bestPersona.personaName) {
            this.logger.debug(`当前persona已是最佳匹配: ${bestPersona.personaName}`);
            return null;
        }
        if (confidence < this.defaultConfig.autoSwitchThreshold) {
            this.logger.debug(`置信度不足，不切换: ${confidence} < ${this.defaultConfig.autoSwitchThreshold}`);
            return null;
        }
        return await this.switchPersona({
            userId,
            fromPersona: currentPersona,
            toPersona: bestPersona.personaName,
            strategy,
            context,
            reason: `自动切换: 置信度 ${confidence.toFixed(2)}, 策略 ${strategy}`,
        });
    }
    getPersonaState(userId, personaName) {
        const userStates = this.personaStates.get(userId);
        if (!userStates) {
            return null;
        }
        return userStates.get(personaName) || null;
    }
    getAllPersonaStates(userId) {
        return this.personaStates.get(userId) || new Map();
    }
    async createStateSnapshot(userId, context) {
        const profile = await this.multiPersonaManager.getMultiPersonaProfile(userId);
        const userStates = this.personaStates.get(userId) || new Map();
        const activePersonas = Array.from(userStates.values())
            .filter(state => state.state === 'ACTIVE')
            .map(state => state.personaName);
        return {
            userId,
            timestamp: new Date(),
            activePersona: profile === null || profile === void 0 ? void 0 : profile.currentPersona,
            personaStates: userStates,
            context: context || {},
            metadata: {
                totalPersonas: (profile === null || profile === void 0 ? void 0 : profile.personas.length) || 0,
                activePersonas: activePersonas.length,
                lastSwitchTime: Array.from(userStates.values())
                    .map(s => s.lastUsedAt)
                    .filter((d) => d !== undefined)
                    .sort((a, b) => b.getTime() - a.getTime())[0],
            },
        };
    }
    async checkSwitchConflicts(request, profile, fromStateInfo, toStateInfo) {
        const conflicts = [];
        if (toStateInfo && toStateInfo.state === 'ARCHIVED') {
            conflicts.push({
                type: 'STATE_CONFLICT',
                message: `目标persona已归档: ${request.toPersona}`,
            });
        }
        if (request.context && toStateInfo) {
            const contextMatch = this.evaluateContextMatch(toStateInfo.contextHistory, request.context);
            if (contextMatch < 0.5) {
                conflicts.push({
                    type: 'CONTEXT_MISMATCH',
                    message: `上下文匹配度低: ${(contextMatch * 100).toFixed(1)}%`,
                });
            }
        }
        return conflicts;
    }
    evaluateContextMatch(contextHistory, currentContext) {
        if (contextHistory.length === 0) {
            return 0.5;
        }
        let totalSimilarity = 0;
        let count = 0;
        for (const history of contextHistory.slice(-10)) {
            const similarity = this.calculateContextSimilarity(history.context, currentContext);
            totalSimilarity += similarity;
            count += 1;
        }
        return count > 0 ? totalSimilarity / count : 0.5;
    }
    calculateContextSimilarity(context1, context2) {
        let matches = 0;
        let total = 0;
        if (context1.environment && context2.environment) {
            if (context1.environment.location === context2.environment.location)
                matches++;
            if (context1.environment.season === context2.environment.season)
                matches++;
            total += 2;
        }
        if (context1.social && context2.social) {
            if (context1.social.socialPreference === context2.social.socialPreference)
                matches++;
            total += 1;
        }
        if (context1.situation && context2.situation) {
            if (context1.situation.tripPurpose === context2.situation.tripPurpose)
                matches++;
            total += 1;
        }
        return total > 0 ? matches / total : 0.5;
    }
    async persistStates() {
        this.logger.debug(`持久化persona状态: ${this.personaStates.size} 个用户`);
    }
    async updatePersonaState(userId, personaName, newState) {
        const userStates = this.personaStates.get(userId);
        if (!userStates) {
            throw new Error(`用户状态不存在: ${userId}`);
        }
        const stateInfo = userStates.get(personaName);
        if (!stateInfo) {
            throw new Error(`Persona状态不存在: ${personaName}`);
        }
        stateInfo.state = newState;
        if (newState === 'ACTIVE') {
            stateInfo.activatedAt = new Date();
        }
        stateInfo.lastUsedAt = new Date();
        this.logger.debug(`更新persona状态: ${userId}/${personaName} -> ${newState}`);
    }
};
exports.PersonaStateManagerService = PersonaStateManagerService;
exports.PersonaStateManagerService = PersonaStateManagerService = PersonaStateManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [multi_persona_manager_service_1.MultiPersonaManagerService,
        persona_identification_service_1.PersonaIdentificationService])
], PersonaStateManagerService);
//# sourceMappingURL=persona-state-manager.service.js.map