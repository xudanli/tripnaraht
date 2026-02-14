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
var CountryPackValidateSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CountryPackValidateSkill = void 0;
const common_1 = require("@nestjs/common");
const pack_validator_service_1 = require("../../trips/readiness/storage/pack-validator.service");
const route_directions_service_1 = require("../../route-directions/route-directions.service");
let CountryPackValidateSkill = CountryPackValidateSkill_1 = class CountryPackValidateSkill {
    constructor(packValidator, routeDirectionsService) {
        this.packValidator = packValidator;
        this.routeDirectionsService = routeDirectionsService;
        this.logger = new common_1.Logger(CountryPackValidateSkill_1.name);
        this.metadata = {
            name: 'countryPack.validate',
            description: '验证 Pack 数据的完整性和正确性，输出结构化错误和警告',
            version: '1.0.0',
            category: 'countryPack',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 countryPack.validate: type=${input.packType}`);
        if (input.packType === 'readiness') {
            return this.validateReadinessPack(input.pack);
        }
        else {
            return this.validateRouteDirectionPack(input.pack);
        }
    }
    validateReadinessPack(pack) {
        if (!this.packValidator) {
            this.logger.warn('PackValidatorService 不可用，使用基本验证');
            return this.basicValidateReadinessPack(pack);
        }
        const result = this.packValidator.validate(pack);
        const criticalIssues = result.errors
            .filter(e => e.code === 'MISSING_FIELD' || e.code === 'EMPTY_RULES')
            .map(e => e.message);
        return {
            valid: result.valid,
            errors: result.errors,
            warnings: result.warnings,
            summary: {
                totalErrors: result.errors.length,
                totalWarnings: result.warnings.length,
                criticalIssues,
            },
        };
    }
    validateRouteDirectionPack(pack) {
        const errors = [];
        const warnings = [];
        if (!pack.countryCode) {
            errors.push({
                path: 'countryCode',
                message: 'countryCode is required',
                code: 'MISSING_FIELD',
            });
        }
        else if (!/^[A-Z]{2}$/.test(pack.countryCode)) {
            errors.push({
                path: 'countryCode',
                message: 'countryCode must be a 2-letter ISO code',
                code: 'INVALID_FORMAT',
            });
        }
        if (!pack.countryName) {
            errors.push({
                path: 'countryName',
                message: 'countryName is required',
                code: 'MISSING_FIELD',
            });
        }
        if (!pack.routeDirections || pack.routeDirections.length === 0) {
            errors.push({
                path: 'routeDirections',
                message: 'At least one routeDirection is required',
                code: 'EMPTY_ROUTE_DIRECTIONS',
            });
        }
        else {
            pack.routeDirections.forEach((rd, index) => {
                const basePath = `routeDirections[${index}]`;
                if (!rd.name) {
                    errors.push({
                        path: `${basePath}.name`,
                        message: 'RouteDirection name is required',
                        code: 'MISSING_FIELD',
                    });
                }
                if (!rd.countryCode) {
                    errors.push({
                        path: `${basePath}.countryCode`,
                        message: 'RouteDirection countryCode is required',
                        code: 'MISSING_FIELD',
                    });
                }
                else if (rd.countryCode !== pack.countryCode) {
                    warnings.push({
                        path: `${basePath}.countryCode`,
                        message: `RouteDirection countryCode (${rd.countryCode}) does not match pack countryCode (${pack.countryCode})`,
                        code: 'MISMATCH_COUNTRY_CODE',
                    });
                }
                if (!rd.tags || rd.tags.length === 0) {
                    warnings.push({
                        path: `${basePath}.tags`,
                        message: 'RouteDirection should have at least one tag',
                        code: 'EMPTY_TAGS',
                    });
                }
            });
        }
        const criticalIssues = errors
            .filter(e => e.code === 'MISSING_FIELD' || e.code === 'EMPTY_ROUTE_DIRECTIONS')
            .map(e => e.message);
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            summary: {
                totalErrors: errors.length,
                totalWarnings: warnings.length,
                criticalIssues,
            },
        };
    }
    basicValidateReadinessPack(pack) {
        const errors = [];
        const warnings = [];
        if (!pack.packId) {
            errors.push({ path: 'packId', message: 'packId is required', code: 'MISSING_FIELD' });
        }
        if (!pack.destinationId) {
            errors.push({ path: 'destinationId', message: 'destinationId is required', code: 'MISSING_FIELD' });
        }
        if (!pack.version) {
            errors.push({ path: 'version', message: 'version is required', code: 'MISSING_FIELD' });
        }
        if (!pack.geo || !pack.geo.countryCode) {
            errors.push({ path: 'geo.countryCode', message: 'geo.countryCode is required', code: 'MISSING_FIELD' });
        }
        if (!pack.rules || pack.rules.length === 0) {
            errors.push({ path: 'rules', message: 'At least one rule is required', code: 'EMPTY_RULES' });
        }
        if (!pack.checklists || pack.checklists.length === 0) {
            warnings.push({ path: 'checklists', message: 'No checklists provided', code: 'EMPTY_CHECKLISTS' });
        }
        const criticalIssues = errors
            .filter(e => e.code === 'MISSING_FIELD' || e.code === 'EMPTY_RULES')
            .map(e => e.message);
        return {
            valid: errors.length === 0,
            errors,
            warnings,
            summary: {
                totalErrors: errors.length,
                totalWarnings: warnings.length,
                criticalIssues,
            },
        };
    }
};
exports.CountryPackValidateSkill = CountryPackValidateSkill;
exports.CountryPackValidateSkill = CountryPackValidateSkill = CountryPackValidateSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [pack_validator_service_1.PackValidatorService,
        route_directions_service_1.RouteDirectionsService])
], CountryPackValidateSkill);
//# sourceMappingURL=country-pack-validate.skill.js.map