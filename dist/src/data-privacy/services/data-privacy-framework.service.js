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
var DataPrivacyFrameworkService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataPrivacyFrameworkService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const encryption_service_1 = require("./encryption.service");
let DataPrivacyFrameworkService = DataPrivacyFrameworkService_1 = class DataPrivacyFrameworkService {
    constructor(prisma, encryptionService) {
        this.prisma = prisma;
        this.encryptionService = encryptionService;
        this.logger = new common_1.Logger(DataPrivacyFrameworkService_1.name);
    }
    async collectMinimalNecessaryData(userRequest, purpose) {
        const requiredFields = this.determineRequiredFields(purpose);
        const excludedFields = [];
        const minimalData = {};
        requiredFields.forEach(field => {
            if (userRequest[field] !== undefined) {
                minimalData[field] = userRequest[field];
            }
        });
        Object.keys(userRequest).forEach(field => {
            if (!requiredFields.includes(field)) {
                excludedFields.push(field);
            }
        });
        this.logger.log(`Collected minimal data for purpose ${purpose}: ${requiredFields.length} required fields, ${excludedFields.length} excluded fields`);
        return {
            requiredFields,
            data: minimalData,
            excludedFields,
        };
    }
    async getUserInformedConsent(userId, dataUsage) {
        const existingConsent = await this.prisma.dataConsent.findFirst({
            where: {
                userId,
                purpose: dataUsage.purpose,
                status: 'ACTIVE',
            },
        });
        if (existingConsent) {
            return {
                required: false,
                consentId: existingConsent.id,
                grantedAt: existingConsent.grantedAt || undefined,
            };
        }
        const consentText = this.generateConsentText(dataUsage);
        const consentFields = dataUsage.fields;
        return {
            required: true,
            consentText,
            consentFields,
        };
    }
    async recordConsent(userId, dataUsage, consentText) {
        await this.prisma.dataConsent.updateMany({
            where: {
                userId,
                purpose: dataUsage.purpose,
                status: 'ACTIVE',
            },
            data: {
                status: 'REVOKED',
                revokedAt: new Date(),
            },
        });
        const consent = await this.prisma.dataConsent.create({
            data: {
                userId,
                purpose: dataUsage.purpose,
                status: 'ACTIVE',
                consentText,
                grantedAt: new Date(),
            },
        });
        this.logger.log(`Consent recorded for user ${userId}, purpose ${dataUsage.purpose}`);
        return consent.id;
    }
    async revokeConsent(userId, purpose) {
        await this.prisma.dataConsent.updateMany({
            where: {
                userId,
                purpose,
                status: 'ACTIVE',
            },
            data: {
                status: 'REVOKED',
                revokedAt: new Date(),
            },
        });
        this.logger.log(`Consent revoked for user ${userId}, purpose ${purpose}`);
    }
    async encryptSensitiveData(data) {
        return this.encryptionService.encrypt(data, 'AES-256');
    }
    async decryptSensitiveData(encryptedData) {
        return this.encryptionService.decrypt(encryptedData);
    }
    async minimizeRetentionPeriod(dataType) {
        let policy = await this.prisma.dataRetentionPolicy.findUnique({
            where: { dataType },
        });
        if (!policy) {
            const defaultPolicies = {
                HEALTH_DATA: 730,
                LOCATION_DATA: 7,
                BEHAVIORAL_DATA: 365,
                PERSONAL_DATA: 90,
                PAYMENT_DATA: 2555,
                OTHER: 90,
            };
            const retentionDays = defaultPolicies[dataType] || 90;
            policy = await this.prisma.dataRetentionPolicy.create({
                data: {
                    dataType,
                    retentionDays,
                    autoDelete: true,
                },
            });
        }
        return {
            dataType: policy.dataType,
            retentionDays: policy.retentionDays,
            autoDelete: policy.autoDelete,
            createdAt: policy.createdAt,
        };
    }
    async getUserDataRights(userId) {
        return {
            access: async () => await this.exportUserData(userId),
            correct: async (field, value) => await this.correctUserData(userId, field, value),
            delete: async () => await this.deleteUserData(userId),
            export: async () => await this.exportUserData(userId),
        };
    }
    async exportUserData(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                profile: true,
            },
        });
        if (!user) {
            throw new Error(`User ${userId} not found`);
        }
        const trips = await this.prisma.trip.findMany({
            where: {
                TripCollaborator: {
                    some: { userId }
                }
            },
            take: 100,
        });
        const userTravelProfile = await this.prisma.userTravelProfile.findUnique({
            where: { userId },
        });
        const data = {
            user: {
                id: user.id,
                email: user.email,
                displayName: user.displayName,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            },
            trips: trips || [],
            profile: userTravelProfile || null,
        };
        return {
            userId,
            exportedAt: new Date(),
            data,
            format: 'json',
        };
    }
    async correctUserData(userId, field, value) {
        if (field.startsWith('user.')) {
            const userField = field.replace('user.', '');
            await this.prisma.user.update({
                where: { id: userId },
                data: { [userField]: value },
            });
        }
        else if (field.startsWith('profile.')) {
            const profileField = field.replace('profile.', '');
            await this.prisma.userTravelProfile.updateMany({
                where: { userId },
                data: { [profileField]: value },
            });
        }
        else {
            throw new Error(`Unknown field: ${field}`);
        }
        this.logger.log(`User data corrected: ${userId}, field: ${field}`);
    }
    async deleteUserData(userId) {
        await this.prisma.user.delete({
            where: { id: userId },
        });
        this.logger.log(`User data deleted: ${userId}`);
    }
    determineRequiredFields(purpose) {
        const fieldMap = {
            HEALTH_RISK_ASSESSMENT: ['age', 'fitnessLevel', 'medicalConditions'],
            LOCATION_TRACKING: ['latitude', 'longitude', 'timestamp'],
            BEHAVIORAL_ANALYSIS: ['searchHistory', 'preferences'],
            TRIP_PLANNING: ['destination', 'travelDates', 'travelers'],
            PERSONALIZATION: ['preferences', 'history'],
            ANALYTICS: ['userId', 'timestamp'],
        };
        return fieldMap[purpose] || [];
    }
    generateConsentText(dataUsage) {
        const purposeText = {
            HEALTH_RISK_ASSESSMENT: '健康风险评估',
            LOCATION_TRACKING: '位置追踪',
            BEHAVIORAL_ANALYSIS: '行为分析',
            TRIP_PLANNING: '行程规划',
            PERSONALIZATION: '个性化推荐',
            ANALYTICS: '数据分析',
        };
        const purpose = purposeText[dataUsage.purpose] || dataUsage.purpose;
        const fields = dataUsage.fields.join('、');
        const retention = `${dataUsage.retentionDays}天`;
        const thirdParty = dataUsage.sharedWithThirdParty
            ? `，并与${dataUsage.thirdPartyName || '第三方'}共享`
            : '';
        return `我们将在${retention}内使用您的${fields}数据用于${purpose}${thirdParty}。您有权随时撤回同意。`;
    }
};
exports.DataPrivacyFrameworkService = DataPrivacyFrameworkService;
exports.DataPrivacyFrameworkService = DataPrivacyFrameworkService = DataPrivacyFrameworkService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        encryption_service_1.EncryptionService])
], DataPrivacyFrameworkService);
//# sourceMappingURL=data-privacy-framework.service.js.map