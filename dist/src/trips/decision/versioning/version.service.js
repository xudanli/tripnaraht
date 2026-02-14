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
var VersionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionService = void 0;
const common_1 = require("@nestjs/common");
let VersionService = VersionService_1 = class VersionService {
    constructor() {
        this.logger = new common_1.Logger(VersionService_1.name);
        this.versionConfig = {
            currentVersion: {
                plannerVersion: 'planner-0.1',
                policyVersion: 'policy-v1.0',
                releasedAt: new Date().toISOString(),
                changelog: 'Initial version',
            },
            featureFlags: {
                useConstraintChecker: {
                    name: 'useConstraintChecker',
                    enabled: true,
                    rolloutPercentage: 100,
                },
                useDataQuality: {
                    name: 'useDataQuality',
                    enabled: true,
                    rolloutPercentage: 100,
                },
                useEventTrigger: {
                    name: 'useEventTrigger',
                    enabled: true,
                    rolloutPercentage: 50,
                },
                useEvaluation: {
                    name: 'useEvaluation',
                    enabled: false,
                    rolloutPercentage: 0,
                },
            },
        };
    }
    getCurrentVersion() {
        return this.versionConfig.currentVersion;
    }
    isFeatureEnabled(flagName, context) {
        const flag = this.versionConfig.featureFlags[flagName];
        if (!flag) {
            this.logger.warn(`Feature flag "${flagName}" not found`);
            return false;
        }
        if (!flag.enabled) {
            return false;
        }
        if (context) {
            if (context.userId &&
                flag.targetUsers &&
                flag.targetUsers.includes(context.userId)) {
                return true;
            }
            if (context.destination &&
                flag.targetDestinations &&
                flag.targetDestinations.includes(context.destination)) {
                return true;
            }
        }
        if (flag.rolloutPercentage < 100) {
            const hash = this.hashString(flagName + ((context === null || context === void 0 ? void 0 : context.userId) || 'default'));
            const percentage = (hash % 100) + 1;
            return percentage <= flag.rolloutPercentage;
        }
        return true;
    }
    updateVersionConfig(config) {
        this.versionConfig = {
            ...this.versionConfig,
            ...config,
            featureFlags: {
                ...this.versionConfig.featureFlags,
                ...(config.featureFlags || {}),
            },
        };
        this.logger.log(`Version config updated: ${JSON.stringify(this.versionConfig.currentVersion)}`);
    }
    setFeatureFlag(flagName, flag) {
        const existing = this.versionConfig.featureFlags[flagName] || {
            name: flagName,
            enabled: false,
            rolloutPercentage: 0,
        };
        this.versionConfig.featureFlags[flagName] = {
            ...existing,
            ...flag,
            name: flagName,
        };
        this.logger.log(`Feature flag "${flagName}" updated: ${JSON.stringify(flag)}`);
    }
    rollbackToVersion(version) {
        this.logger.warn(`Rolling back to version: ${version.plannerVersion} (${version.policyVersion})`);
        this.versionConfig.fallbackVersion = this.versionConfig.currentVersion;
        this.versionConfig.currentVersion = version;
    }
    restoreVersion() {
        if (this.versionConfig.fallbackVersion) {
            this.logger.log('Restoring to previous version');
            this.versionConfig.currentVersion = this.versionConfig.fallbackVersion;
            this.versionConfig.fallbackVersion = undefined;
        }
    }
    getAllFeatureFlags() {
        return { ...this.versionConfig.featureFlags };
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
};
exports.VersionService = VersionService;
exports.VersionService = VersionService = VersionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], VersionService);
//# sourceMappingURL=version.service.js.map