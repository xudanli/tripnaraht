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
var RoutePackValidateSkill_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoutePackValidateSkill = void 0;
const common_1 = require("@nestjs/common");
let RoutePackValidateSkill = RoutePackValidateSkill_1 = class RoutePackValidateSkill {
    constructor() {
        this.logger = new common_1.Logger(RoutePackValidateSkill_1.name);
        this.metadata = {
            name: 'routePack.validate',
            description: '验证 RoutePack 数据的完整性和正确性，输出结构化错误和警告',
            version: '1.0.0',
            category: 'countryPack',
        };
    }
    async execute(input) {
        this.logger.debug(`执行 routePack.validate: packId=${input.pack.metadata.packId}`);
        const errors = [];
        const warnings = [];
        if (!input.pack.metadata) {
            errors.push({
                path: 'metadata',
                message: 'metadata is required',
                code: 'MISSING_FIELD',
            });
        }
        else {
            if (!input.pack.metadata.packId) {
                errors.push({
                    path: 'metadata.packId',
                    message: 'metadata.packId is required',
                    code: 'MISSING_FIELD',
                });
            }
            else if (!input.pack.metadata.packId.startsWith('routePack:')) {
                warnings.push({
                    path: 'metadata.packId',
                    message: 'packId should start with "routePack:"',
                    code: 'INVALID_FORMAT',
                });
            }
            if (!input.pack.metadata.countryCode) {
                errors.push({
                    path: 'metadata.countryCode',
                    message: 'metadata.countryCode is required',
                    code: 'MISSING_FIELD',
                });
            }
            else if (!/^[A-Z]{2}$/.test(input.pack.metadata.countryCode)) {
                errors.push({
                    path: 'metadata.countryCode',
                    message: 'countryCode must be a 2-letter ISO code',
                    code: 'INVALID_FORMAT',
                });
            }
            if (!input.pack.metadata.version) {
                errors.push({
                    path: 'metadata.version',
                    message: 'metadata.version is required',
                    code: 'MISSING_FIELD',
                });
            }
            else if (!/^\d+\.\d+\.\d+$/.test(input.pack.metadata.version)) {
                warnings.push({
                    path: 'metadata.version',
                    message: 'version should follow semantic versioning (e.g., "1.0.0")',
                    code: 'INVALID_FORMAT',
                });
            }
            if (!input.pack.metadata.lastVerifiedAt) {
                warnings.push({
                    path: 'metadata.lastVerifiedAt',
                    message: 'lastVerifiedAt is recommended',
                    code: 'MISSING_FIELD',
                });
            }
        }
        if (!input.pack.blocks || input.pack.blocks.length === 0) {
            errors.push({
                path: 'blocks',
                message: 'At least one block is required',
                code: 'EMPTY_BLOCKS',
            });
        }
        else {
            input.pack.blocks.forEach((block, index) => {
                const basePath = `blocks[${index}]`;
                if (!block.blockId) {
                    errors.push({
                        path: `${basePath}.blockId`,
                        message: 'blockId is required',
                        code: 'MISSING_FIELD',
                    });
                }
                if (!block.type) {
                    errors.push({
                        path: `${basePath}.type`,
                        message: 'type is required',
                        code: 'MISSING_FIELD',
                    });
                }
                else {
                    const validTypes = ['constraint', 'preference', 'safety', 'logistics', 'seasonality', 'risk'];
                    if (!validTypes.includes(block.type)) {
                        errors.push({
                            path: `${basePath}.type`,
                            message: `type must be one of: ${validTypes.join(', ')}`,
                            code: 'INVALID_VALUE',
                        });
                    }
                }
                if (!block.content) {
                    warnings.push({
                        path: `${basePath}.content`,
                        message: 'content is recommended',
                        code: 'MISSING_FIELD',
                    });
                }
                if (!block.evidence || block.evidence.length === 0) {
                    warnings.push({
                        path: `${basePath}.evidence`,
                        message: 'evidence is recommended for RAG credibility',
                        code: 'MISSING_FIELD',
                    });
                }
                else {
                    block.evidence.forEach((evidence, evIndex) => {
                        const evPath = `${basePath}.evidence[${evIndex}]`;
                        if (!evidence.source) {
                            errors.push({
                                path: `${evPath}.source`,
                                message: 'evidence.source is required',
                                code: 'MISSING_FIELD',
                            });
                        }
                        if (!evidence.verifiedAt) {
                            errors.push({
                                path: `${evPath}.verifiedAt`,
                                message: 'evidence.verifiedAt is required',
                                code: 'MISSING_FIELD',
                            });
                        }
                        if (evidence.confidence === undefined || evidence.confidence < 0 || evidence.confidence > 1) {
                            warnings.push({
                                path: `${evPath}.confidence`,
                                message: 'confidence should be between 0 and 1',
                                code: 'INVALID_VALUE',
                            });
                        }
                    });
                }
                if (!block.source) {
                    warnings.push({
                        path: `${basePath}.source`,
                        message: 'source is recommended',
                        code: 'MISSING_FIELD',
                    });
                }
                if (!block.lastVerifiedAt) {
                    warnings.push({
                        path: `${basePath}.lastVerifiedAt`,
                        message: 'lastVerifiedAt is recommended',
                        code: 'MISSING_FIELD',
                    });
                }
            });
        }
        const criticalIssues = errors
            .filter((e) => e.code === 'MISSING_FIELD' || e.code === 'EMPTY_BLOCKS')
            .map((e) => e.message);
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
exports.RoutePackValidateSkill = RoutePackValidateSkill;
exports.RoutePackValidateSkill = RoutePackValidateSkill = RoutePackValidateSkill_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], RoutePackValidateSkill);
//# sourceMappingURL=route-pack-validate.skill.js.map