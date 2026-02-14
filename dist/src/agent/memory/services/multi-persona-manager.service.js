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
var MultiPersonaManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiPersonaManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const persona_identification_service_1 = require("./persona-identification.service");
let MultiPersonaManagerService = MultiPersonaManagerService_1 = class MultiPersonaManagerService {
    constructor(prisma, personaIdentification) {
        this.prisma = prisma;
        this.personaIdentification = personaIdentification;
        this.logger = new common_1.Logger(MultiPersonaManagerService_1.name);
    }
    async getMultiPersonaProfile(userId) {
        try {
            const profile = await this.prisma.userTravelProfile.findUnique({
                where: { userId },
            });
            if (!profile) {
                return null;
            }
            const metadata = profile.metadata || {};
            const personas = metadata.personas || [];
            const currentPersona = metadata.currentPersona || null;
            return {
                userId: profile.userId,
                personas: personas.map(p => this.deserializePersona(p)),
                currentPersona: currentPersona || undefined,
                baseProfile: {
                    pacePreference: profile.pacePreference,
                    altitudeTolerance: profile.altitudeTolerance,
                    riskTolerance: profile.riskTolerance,
                    travelPhilosophy: profile.travelPhilosophy,
                    preferredRouteTypes: profile.preferredRouteTypes,
                },
                confidence: profile.confidence,
                source: profile.source,
                updatedAt: profile.updatedAt,
            };
        }
        catch (error) {
            this.logger.error(`获取多persona画像失败: ${error}`, error instanceof Error ? error.stack : undefined);
            return null;
        }
    }
    async saveMultiPersonaProfile(profile) {
        try {
            const serializedPersonas = profile.personas.map(p => this.serializePersona(p));
            await this.prisma.userTravelProfile.upsert({
                where: { userId: profile.userId },
                create: {
                    userId: profile.userId,
                    pacePreference: profile.baseProfile.pacePreference,
                    altitudeTolerance: profile.baseProfile.altitudeTolerance,
                    riskTolerance: profile.baseProfile.riskTolerance,
                    travelPhilosophy: profile.baseProfile.travelPhilosophy,
                    preferredRouteTypes: profile.baseProfile.preferredRouteTypes,
                    confidence: profile.confidence,
                    source: profile.source,
                },
                update: {
                    pacePreference: profile.baseProfile.pacePreference,
                    altitudeTolerance: profile.baseProfile.altitudeTolerance,
                    riskTolerance: profile.baseProfile.riskTolerance,
                    travelPhilosophy: profile.baseProfile.travelPhilosophy,
                    preferredRouteTypes: profile.baseProfile.preferredRouteTypes,
                    confidence: profile.confidence,
                    source: profile.source,
                    updatedAt: new Date(),
                },
            });
            this.logger.log(`保存多persona画像成功: ${profile.userId}`);
        }
        catch (error) {
            this.logger.error(`保存多persona画像失败: ${error}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async addOrUpdatePersona(userId, persona) {
        const profile = await this.getMultiPersonaProfile(userId);
        if (!profile) {
            throw new Error(`用户画像不存在: ${userId}`);
        }
        const existingIndex = profile.personas.findIndex(p => p.personaName === persona.personaName);
        if (existingIndex >= 0) {
            profile.personas[existingIndex] = persona;
        }
        else {
            profile.personas.push(persona);
        }
        await this.saveMultiPersonaProfile(profile);
    }
    async activatePersona(userId, personaName) {
        const profile = await this.getMultiPersonaProfile(userId);
        if (!profile) {
            throw new Error(`用户画像不存在: ${userId}`);
        }
        const persona = profile.personas.find(p => p.personaName === personaName);
        if (!persona) {
            throw new Error(`Persona不存在: ${personaName}`);
        }
        profile.currentPersona = personaName;
        persona.usageCount += 1;
        persona.updatedAt = new Date();
        await this.saveMultiPersonaProfile(profile);
    }
    async createMultiPersonaFromBaseProfile(baseProfile, context) {
        const { persona } = await this.personaIdentification.identifyCurrentPersona(baseProfile, context);
        return {
            userId: baseProfile.userId,
            personas: [persona],
            currentPersona: persona.personaName,
            baseProfile: {
                pacePreference: baseProfile.pacePreference,
                altitudeTolerance: baseProfile.altitudeTolerance,
                riskTolerance: baseProfile.riskTolerance,
                travelPhilosophy: baseProfile.travelPhilosophy,
                preferredRouteTypes: baseProfile.preferredRouteTypes,
            },
            confidence: baseProfile.confidence,
            source: baseProfile.source,
            updatedAt: new Date(),
        };
    }
    async detectAndUpdatePersonaChange(userId, signals) {
        const profile = await this.getMultiPersonaProfile(userId);
        if (!profile || !profile.currentPersona) {
            return {
                hasChanged: false,
                changeReasons: [],
            };
        }
        const currentPersona = profile.personas.find(p => p.personaName === profile.currentPersona);
        if (!currentPersona) {
            return {
                hasChanged: false,
                changeReasons: [],
            };
        }
        const changeResult = this.personaIdentification.detectPersonaChange(currentPersona, signals);
        if (changeResult.hasChanged && changeResult.newPersona) {
            const index = profile.personas.findIndex(p => p.personaName === currentPersona.personaName);
            if (index >= 0) {
                profile.personas[index] = changeResult.newPersona;
                await this.saveMultiPersonaProfile(profile);
            }
        }
        return changeResult;
    }
    serializePersona(persona) {
        return {
            ...persona,
            createdAt: persona.createdAt.toISOString(),
            updatedAt: persona.updatedAt.toISOString(),
            activityHistory: persona.activityHistory.map(activity => ({
                ...activity,
                timestamp: activity.timestamp.toISOString(),
            })),
        };
    }
    deserializePersona(data) {
        return {
            ...data,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
            activityHistory: (data.activityHistory || []).map((activity) => ({
                ...activity,
                timestamp: new Date(activity.timestamp),
            })),
        };
    }
};
exports.MultiPersonaManagerService = MultiPersonaManagerService;
exports.MultiPersonaManagerService = MultiPersonaManagerService = MultiPersonaManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        persona_identification_service_1.PersonaIdentificationService])
], MultiPersonaManagerService);
//# sourceMappingURL=multi-persona-manager.service.js.map