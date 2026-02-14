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
var RouteDirectionsController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const route_directions_service_1 = require("./route-directions.service");
const route_direction_observability_service_1 = require("./services/route-direction-observability.service");
const route_direction_card_service_1 = require("./services/route-direction-card.service");
const route_direction_selector_service_1 = require("./services/route-direction-selector.service");
const route_direction_explainer_service_1 = require("./services/route-direction-explainer.service");
const create_route_direction_dto_1 = require("./dto/create-route-direction.dto");
const update_route_direction_dto_1 = require("./dto/update-route-direction.dto");
const route_direction_card_dto_1 = require("./dto/route-direction-card.dto");
const route_direction_interaction_dto_1 = require("./dto/route-direction-interaction.dto");
const create_route_template_dto_1 = require("./dto/create-route-template.dto");
const update_route_template_dto_1 = require("./dto/update-route-template.dto");
const create_trip_from_template_dto_1 = require("./dto/create-trip-from-template.dto");
const add_poi_to_template_dto_1 = require("./dto/add-poi-to-template.dto");
const remove_poi_from_template_dto_1 = require("./dto/remove-poi-from-template.dto");
const query_route_direction_dto_1 = require("./dto/query-route-direction.dto");
const query_route_template_dto_1 = require("./dto/query-route-template.dto");
const import_country_pack_dto_1 = require("./dto/import-country-pack.dto");
const available_pois_query_dto_1 = require("./dto/available-pois-query.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const current_user_decorator_1 = require("../auth/decorators/current-user.decorator");
let RouteDirectionsController = RouteDirectionsController_1 = class RouteDirectionsController {
    constructor(routeDirectionsService, observabilityService, cardService, selectorService, explainerService) {
        this.routeDirectionsService = routeDirectionsService;
        this.observabilityService = observabilityService;
        this.cardService = cardService;
        this.selectorService = selectorService;
        this.explainerService = explainerService;
        this.logger = new common_1.Logger(RouteDirectionsController_1.name);
    }
    async createRouteDirection(dto) {
        try {
            const result = await this.routeDirectionsService.createRouteDirection(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to create route direction', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to create route direction');
        }
    }
    async findRouteDirections(query) {
        try {
            const results = await this.routeDirectionsService.findRouteDirections(query);
            return (0, standard_response_dto_1.successResponse)(results);
        }
        catch (error) {
            this.logger.error('Failed to find route directions', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to find route directions');
        }
    }
    async getRouteTemplates(query) {
        try {
            const result = await this.routeDirectionsService.findRouteTemplates({
                routeDirectionId: query.routeDirectionId,
                durationDays: query.durationDays,
                isActive: query.isActive,
                limit: query.limit,
                offset: query.offset,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to get route templates', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to get route templates', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async getRouteTemplateById(id) {
        try {
            const result = await this.routeDirectionsService.findRouteTemplateById(id);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            this.logger.error('Failed to get route template by id', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to get route template by id', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async getAvailablePoisByTemplate(id, query) {
        try {
            const result = await this.routeDirectionsService.getAvailablePoisByTemplate(id, {
                category: query.category,
                search: query.search,
                page: query.page,
                limit: query.limit,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException || error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            this.logger.error('Failed to get available pois by template', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to get available pois by template', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async getTemplateMigrationStatus(id) {
        try {
            const result = await this.routeDirectionsService.getTemplateMigrationStatus(id);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            this.logger.error('Failed to get template migration status', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to get template migration status', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async getRouteDirectionById(id) {
        try {
            const result = await this.routeDirectionsService.findRouteDirectionById(id);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error('Failed to get route direction', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get route direction');
        }
    }
    async getRouteDirectionByUuid(uuid) {
        try {
            const result = await this.routeDirectionsService.findRouteDirectionByUuid(uuid);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error('Failed to get route direction', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get route direction');
        }
    }
    async updateRouteDirection(id, dto) {
        try {
            const result = await this.routeDirectionsService.updateRouteDirection(id, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error('Failed to update route direction', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to update route direction');
        }
    }
    async deleteRouteDirection(id) {
        try {
            await this.routeDirectionsService.deleteRouteDirection(id);
            return (0, standard_response_dto_1.successResponse)(null);
        }
        catch (error) {
            this.logger.error('Failed to delete route direction', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to delete route direction', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async createRouteTemplate(dto) {
        try {
            const result = await this.routeDirectionsService.createRouteTemplate(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to create route template', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to create route template', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async importCountryPack(dto) {
        try {
            const result = await this.routeDirectionsService.importCountryPack(dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to import country pack', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to import country pack', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async updateRouteTemplate(id, dto) {
        try {
            if (dto.dayPlans) {
                this.logger.debug(`Controller received dayPlans for template ${id}:`, JSON.stringify(dto.dayPlans, null, 2));
            }
            const result = await this.routeDirectionsService.updateRouteTemplate(id, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            this.logger.error('Failed to update route template', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to update route template', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async deleteRouteTemplate(id) {
        try {
            await this.routeDirectionsService.deleteRouteTemplate(id);
            return (0, standard_response_dto_1.successResponse)({ message: 'Route template deleted successfully' });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            this.logger.error('Failed to delete route template', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to delete route template', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async hardDeleteRouteTemplate(id) {
        try {
            await this.routeDirectionsService.hardDeleteRouteTemplate(id);
            return (0, standard_response_dto_1.successResponse)({ message: 'Route template hard deleted successfully' });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            this.logger.error('Failed to hard delete route template', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to hard delete route template', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async addPoiToTemplate(templateId, dto) {
        try {
            const result = await this.routeDirectionsService.addPoiToTemplate(templateId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message, { statusCode: 400 });
            }
            this.logger.error('Failed to add POI to template', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error instanceof Error ? error.message : 'Failed to add POI to template', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async removePoiFromTemplate(templateId, dto) {
        try {
            const result = await this.routeDirectionsService.removePoiFromTemplate(templateId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message, { statusCode: 400 });
            }
            this.logger.error('Failed to remove POI from template', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error instanceof Error ? error.message : 'Failed to remove POI from template', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async updatePoiInTemplate(templateId, dto) {
        try {
            const result = await this.routeDirectionsService.updatePoiInTemplate(templateId, dto);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message, { statusCode: 400 });
            }
            this.logger.error('Failed to update POI in template', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error instanceof Error ? error.message : 'Failed to update POI in template', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async bulkUpdatePoiPriority(templateId, dto) {
        try {
            const result = await this.routeDirectionsService.bulkUpdatePoiPriority(templateId, dto.updates);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            this.logger.error('Failed to bulk update POI priority', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error instanceof Error ? error.message : 'Failed to bulk update POI priority', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async createTripFromTemplate(templateId, dto, user) {
        try {
            const userId = (user === null || user === void 0 ? void 0 : user.userId) || null;
            const result = await this.routeDirectionsService.createTripFromTemplate(templateId, dto, userId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message, { statusCode: 404 });
            }
            this.logger.error('Failed to create trip from template', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error instanceof Error ? error.message : 'Failed to create trip from template', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async getRouteDirectionsByCountry(countryCode, tags, month, limit) {
        try {
            const results = await this.routeDirectionsService.findRouteDirectionsByCountry(countryCode, {
                tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
                month: month ? parseInt(month.toString(), 10) : undefined,
                limit: limit ? parseInt(limit.toString(), 10) : undefined,
            });
            return (0, standard_response_dto_1.successResponse)(results);
        }
        catch (error) {
            this.logger.error('Failed to get route directions by country', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, 'Failed to get route directions by country', { originalError: error instanceof Error ? error.message : String(error) });
        }
    }
    async getTraceReport(requestId) {
        try {
            const report = this.observabilityService.generateTraceReport(requestId);
            return (0, standard_response_dto_1.successResponse)(report);
        }
        catch (error) {
            this.logger.error('Failed to get trace report', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get trace report');
        }
    }
    async getMetrics() {
        try {
            const metrics = this.observabilityService.getMetrics();
            return (0, standard_response_dto_1.successResponse)(metrics);
        }
        catch (error) {
            this.logger.error('Failed to get metrics', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get metrics');
        }
    }
    async getRouteDirectionCards(countryCode, month, preferences, pace, riskTolerance) {
        try {
            const recommendations = await this.selectorService.pickRouteDirections({
                preferences: preferences ? (Array.isArray(preferences) ? preferences : [preferences]) : undefined,
                pace,
                riskTolerance,
            }, countryCode, month ? parseInt(month.toString(), 10) : undefined);
            const cards = recommendations.map(rec => {
                return this.cardService.toCard(rec, rec.scoreBreakdown, rec.matchedSignals);
            });
            return (0, standard_response_dto_1.successResponse)(cards);
        }
        catch (error) {
            this.logger.error('Failed to get route direction cards', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get route direction cards');
        }
    }
    async getRouteDirectionCardById(id) {
        try {
            const routeDirection = await this.routeDirectionsService.findRouteDirectionById(id);
            const recommendation = {
                routeDirection,
                score: 0,
                reasons: [],
                constraints: routeDirection.constraints,
                riskProfile: routeDirection.riskProfile,
                signaturePois: routeDirection.signaturePois,
            };
            const card = this.cardService.toCard(recommendation);
            return (0, standard_response_dto_1.successResponse)(card);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error('Failed to get route direction card', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get route direction card');
        }
    }
    async getRouteDirectionExplainer(id) {
        try {
            const routeDirection = await this.routeDirectionsService.findRouteDirectionById(id);
            const recommendation = {
                routeDirection,
                score: 0,
                reasons: [],
                constraints: routeDirection.constraints,
                riskProfile: routeDirection.riskProfile,
                signaturePois: routeDirection.signaturePois,
            };
            const explainer = this.explainerService.generateExplainer(recommendation);
            return (0, standard_response_dto_1.successResponse)(explainer);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            this.logger.error('Failed to get route direction explainer', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get route direction explainer');
        }
    }
    async getRouteDirectionExplainers(countryCode) {
        try {
            const routeDirections = await this.routeDirectionsService.findRouteDirectionsByCountry(countryCode, {
                includeDeprecated: false,
            });
            const explainers = routeDirections.active.map(rd => {
                const recommendation = {
                    routeDirection: rd,
                    score: 0,
                    reasons: [],
                    constraints: rd.constraints,
                    riskProfile: rd.riskProfile,
                    signaturePois: rd.signaturePois,
                };
                return this.explainerService.generateExplainer(recommendation);
            });
            return (0, standard_response_dto_1.successResponse)(explainers);
        }
        catch (error) {
            this.logger.error('Failed to get route direction explainers', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get route direction explainers');
        }
    }
    async getRouteDirectionInteractions(countryCode, month, preferences, pace, riskTolerance) {
        try {
            const recommendations = await this.selectorService.pickRouteDirections({
                preferences: preferences ? (Array.isArray(preferences) ? preferences : [preferences]) : undefined,
                pace,
                riskTolerance,
            }, countryCode, month ? parseInt(month.toString(), 10) : undefined);
            const interactions = recommendations.map(rec => {
                const card = this.cardService.toCard(rec, rec.scoreBreakdown, rec.matchedSignals);
                const explanation = this.generateExplanation(rec, rec.scoreBreakdown);
                const whyNotOthers = rec.whyNotOthers;
                return {
                    direction: card,
                    score: rec.score,
                    scoreBreakdown: rec.scoreBreakdown || {
                        tagMatch: { score: 0, weight: 0, matchedTags: [], totalTags: 0 },
                        seasonality: { score: 0, weight: 0, isBestMonth: false, isAvoidMonth: false, month: 0 },
                        pace: { score: 0, weight: 0, userPace: 'moderate', routePace: 'MODERATE', compatible: false },
                        risk: { score: 0, weight: 0, userTolerance: 'medium', routeRisk: 'medium', compatible: false },
                    },
                    explanation,
                    whyNotOthers,
                };
            });
            const result = {
                directions: interactions,
                countryCode,
                month: month ? parseInt(month.toString(), 10) : undefined,
                preferences: preferences ? (Array.isArray(preferences) ? preferences : [preferences]) : [],
            };
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Failed to get route direction interactions', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, (error === null || error === void 0 ? void 0 : error.message) || 'Failed to get route direction interactions');
        }
    }
    generateExplanation(recommendation, scoreBreakdown) {
        var _a, _b, _c;
        const reasons = [];
        if (((_a = scoreBreakdown === null || scoreBreakdown === void 0 ? void 0 : scoreBreakdown.tagMatch) === null || _a === void 0 ? void 0 : _a.matchedTags) && scoreBreakdown.tagMatch.matchedTags.length > 0) {
            const tags = scoreBreakdown.tagMatch.matchedTags.join('、');
            reasons.push(`这条路线特别适合${tags}爱好者`);
        }
        if ((_b = scoreBreakdown === null || scoreBreakdown === void 0 ? void 0 : scoreBreakdown.seasonality) === null || _b === void 0 ? void 0 : _b.isBestMonth) {
            reasons.push(`${scoreBreakdown.seasonality.month}月是这条路线的最佳旅行时间`);
        }
        if ((_c = scoreBreakdown === null || scoreBreakdown === void 0 ? void 0 : scoreBreakdown.pace) === null || _c === void 0 ? void 0 : _c.compatible) {
            reasons.push(`路线节奏与您的偏好高度匹配`);
        }
        if (reasons.length === 0) {
            reasons.push('这条路线符合您的基本偏好');
        }
        return reasons.join('。') + '。';
    }
};
exports.RouteDirectionsController = RouteDirectionsController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '创建路线方向', description: '创建新的国家级路线方向资产' }),
    (0, swagger_1.ApiBody)({ type: create_route_direction_dto_1.CreateRouteDirectionDto }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '成功创建路线方向' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_route_direction_dto_1.CreateRouteDirectionDto]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "createRouteDirection", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '查询路线方向', description: '根据条件查询路线方向列表' }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, description: '国家代码' }),
    (0, swagger_1.ApiQuery)({ name: 'tag', required: false, description: '标签' }),
    (0, swagger_1.ApiQuery)({ name: 'tags', required: false, description: '标签数组', type: [String] }),
    (0, swagger_1.ApiQuery)({ name: 'isActive', required: false, description: '是否激活', type: Boolean }),
    (0, swagger_1.ApiQuery)({ name: 'month', required: false, description: '月份（1-12）', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线方向列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_route_direction_dto_1.QueryRouteDirectionDto]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "findRouteDirections", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('templates'),
    (0, swagger_1.ApiOperation)({
        summary: '查询路线模板列表',
        description: '根据条件查询路线模板列表，支持按路线方向ID、天数、激活状态筛选'
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线模板列表' }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_route_template_dto_1.QueryRouteTemplateDto]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getRouteTemplates", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('templates/:id'),
    (0, swagger_1.ApiOperation)({ summary: '获取路线模板详情', description: '根据 ID 获取路线模板详情' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线模板详情' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getRouteTemplateById", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('templates/:id/available-pois'),
    (0, swagger_1.ApiOperation)({
        summary: '按路线模板获取可用POI列表',
        description: '根据路线模板关联的路线方向，自动获取该国家/地区的可用POI列表。支持按类别筛选、搜索关键词和分页。'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回可用POI列表' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, available_pois_query_dto_1.AvailablePoisQueryDto]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getAvailablePoisByTemplate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('templates/:id/migration-status'),
    (0, swagger_1.ApiOperation)({
        summary: '检查路线模板迁移状态',
        description: '检查路线模板是否使用旧格式（只有requiredNodes）或新格式（包含pois数组）'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回迁移状态' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getTemplateMigrationStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '获取路线方向详情', description: '根据 ID 获取路线方向详情' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线方向 ID', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线方向详情' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线方向不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getRouteDirectionById", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('uuid/:uuid'),
    (0, swagger_1.ApiOperation)({ summary: '根据 UUID 获取路线方向', description: '根据 UUID 获取路线方向详情' }),
    (0, swagger_1.ApiParam)({ name: 'uuid', description: '路线方向 UUID', type: String }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线方向详情' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线方向不存在' }),
    __param(0, (0, common_1.Param)('uuid')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getRouteDirectionByUuid", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '更新路线方向', description: '更新路线方向信息' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线方向 ID', type: Number }),
    (0, swagger_1.ApiBody)({ type: update_route_direction_dto_1.UpdateRouteDirectionDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功更新路线方向' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线方向不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_route_direction_dto_1.UpdateRouteDirectionDto]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "updateRouteDirection", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '删除路线方向', description: '软删除路线方向（设置 isActive = false）' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线方向 ID', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功删除路线方向' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "deleteRouteDirection", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('templates'),
    (0, swagger_1.ApiOperation)({ summary: '创建路线模板', description: '创建基于路线方向的行程模板' }),
    (0, swagger_1.ApiBody)({ type: create_route_template_dto_1.CreateRouteTemplateDto }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '成功创建路线模板' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_route_template_dto_1.CreateRouteTemplateDto]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "createRouteTemplate", null);
__decorate([
    (0, common_1.Post)('import-pack'),
    (0, swagger_1.ApiOperation)({
        summary: '批量导入国家 Pack',
        description: '从 CountryPackSkeleton JSON 格式批量导入 RouteDirection。用于导入通过 new-country-pack.ts 生成的国家 Pack 配置',
    }),
    (0, swagger_1.ApiBody)({ type: import_country_pack_dto_1.ImportCountryPackDto }),
    (0, swagger_1.ApiResponse)({
        status: 201,
        description: '成功导入国家 Pack',
        type: import_country_pack_dto_1.ImportCountryPackResultDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [import_country_pack_dto_1.ImportCountryPackDto]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "importCountryPack", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('templates/:id'),
    (0, swagger_1.ApiOperation)({ summary: '更新路线模板', description: '更新路线模板信息' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiBody)({ type: update_route_template_dto_1.UpdateRouteTemplateDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功更新路线模板' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_route_template_dto_1.UpdateRouteTemplateDto]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "updateRouteTemplate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('templates/:id'),
    (0, swagger_1.ApiOperation)({ summary: '删除路线模板', description: '软删除路线模板（设置 isActive = false）' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功删除路线模板' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "deleteRouteTemplate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('templates/:id/hard'),
    (0, swagger_1.ApiOperation)({ summary: '物理删除路线模板', description: '从数据库中彻底删除路线模板（不可恢复）' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功物理删除路线模板' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "hardDeleteRouteTemplate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('templates/:id/pois'),
    (0, swagger_1.ApiOperation)({
        summary: '向路线模板添加 POI',
        description: '向指定路线的指定日期添加 POI。POI 会自动添加到 dayPlans[day].pois 数组中，并更新 RouteDirection 的 signaturePois.examples'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiBody)({ type: add_poi_to_template_dto_1.AddPoiToTemplateDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功添加 POI' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板或 POI 不存在' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'POI 已存在或参数错误' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, add_poi_to_template_dto_1.AddPoiToTemplateDto]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "addPoiToTemplate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('templates/:id/pois'),
    (0, swagger_1.ApiOperation)({
        summary: '从路线模板移除 POI',
        description: '从指定路线的指定日期移除 POI。可以通过 poiId、poiUuid 或 index 指定要移除的 POI'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiBody)({ type: remove_poi_from_template_dto_1.RemovePoiFromTemplateDto }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功移除 POI' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板或 POI 不存在' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '参数错误' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, remove_poi_from_template_dto_1.RemovePoiFromTemplateDto]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "removePoiFromTemplate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Patch)('templates/:id/pois'),
    (0, swagger_1.ApiOperation)({
        summary: '更新路线模板中的 POI',
        description: '更新指定路线模板中的 POI 信息，包括优先级、顺序、停留时间等'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                day: { type: 'number', description: '第几天（从1开始）' },
                poiId: { type: 'number', description: 'POI ID' },
                priority: { type: 'string', enum: ['MUST_SEE', 'HIGH', 'MEDIUM', 'LOW', 'OPTIONAL'], description: 'POI优先级' },
                startTime: { type: 'string', description: '开始时间（ISO 8601 或 HH:mm 格式）' },
                endTime: { type: 'string', description: '结束时间（ISO 8601 或 HH:mm 格式）' },
                durationMinutes: { type: 'number', description: '停留时间（分钟）' },
                priorityReason: { type: 'string', description: '优先级原因说明' },
            },
            required: ['day', 'poiId'],
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功更新 POI' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板或 POI 不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "updatePoiInTemplate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Patch)('templates/:id/pois/bulk-priority'),
    (0, swagger_1.ApiOperation)({
        summary: '批量更新 POI 优先级',
        description: '批量更新路线模板中多个 POI 的优先级'
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                updates: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            day: { type: 'number', description: '第几天（从1开始）' },
                            poiId: { type: 'number', description: 'POI ID' },
                            priority: { type: 'string', enum: ['MUST_SEE', 'HIGH', 'MEDIUM', 'LOW', 'OPTIONAL'] },
                            priorityReason: { type: 'string', description: '优先级原因说明' },
                        },
                        required: ['day', 'poiId', 'priority'],
                    }
                }
            },
            required: ['updates'],
        }
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功批量更新 POI 优先级' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Object]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "bulkUpdatePoiPriority", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('templates/:id/create-trip'),
    (0, swagger_1.ApiOperation)({
        summary: '使用模板创建行程',
        description: '从路线模板生成可执行行程（对应工作台的"使用模板"按钮）',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线模板 ID', type: Number }),
    (0, swagger_1.ApiBody)({ type: create_trip_from_template_dto_1.CreateTripFromRouteTemplateDto }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '成功创建行程' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '路线模板不存在' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求参数错误' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, create_trip_from_template_dto_1.CreateTripFromRouteTemplateDto, Object]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "createTripFromTemplate", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('by-country/:countryCode'),
    (0, swagger_1.ApiOperation)({
        summary: '根据国家获取路线方向',
        description: '用于 Agent 路由，根据国家代码获取可用的路线方向',
    }),
    (0, swagger_1.ApiParam)({ name: 'countryCode', description: '国家代码', type: String }),
    (0, swagger_1.ApiQuery)({ name: 'tags', required: false, description: '标签数组', type: [String] }),
    (0, swagger_1.ApiQuery)({ name: 'month', required: false, description: '月份（1-12）', type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: '返回数量限制', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线方向列表' }),
    __param(0, (0, common_1.Param)('countryCode')),
    __param(1, (0, common_1.Query)('tags')),
    __param(2, (0, common_1.Query)('month')),
    __param(3, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Array, Number, Number]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getRouteDirectionsByCountry", null);
__decorate([
    (0, common_1.Get)('observability/trace/:requestId'),
    (0, swagger_1.ApiOperation)({
        summary: '[Internal] 获取请求 trace 报告',
        description: '⚠️ 内部调试接口。获取指定请求的完整 trace 报告，用于回答"慢在哪""为什么选了这条 RD""为什么 POI pool 变小"',
    }),
    (0, swagger_1.ApiParam)({ name: 'requestId', description: '请求 ID', type: String }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回 trace 报告' }),
    __param(0, (0, common_1.Param)('requestId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getTraceReport", null);
__decorate([
    (0, common_1.Get)('observability/metrics'),
    (0, swagger_1.ApiOperation)({
        summary: '[Internal] 获取聚合 metrics',
        description: '⚠️ 内部调试接口。获取 RouteDirection 相关的聚合 metrics（延迟、质量、错误）',
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回 metrics' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getMetrics", null);
__decorate([
    (0, common_1.Get)('cards'),
    (0, swagger_1.ApiOperation)({
        summary: '[Deprecated] 获取路线方向卡片列表',
        description: '⚠️ 已废弃，请使用 GET /interactions。获取面向前端/LLM 的路线方向卡片，用于在生成行程前展示',
    }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: true, description: '国家代码' }),
    (0, swagger_1.ApiQuery)({ name: 'month', required: false, description: '月份（1-12）', type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'preferences', required: false, description: '偏好标签', type: [String] }),
    (0, swagger_1.ApiQuery)({ name: 'pace', required: false, description: '节奏偏好', enum: ['relaxed', 'moderate', 'intense'] }),
    (0, swagger_1.ApiQuery)({ name: 'riskTolerance', required: false, description: '风险承受度', enum: ['low', 'medium', 'high'] }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线方向卡片列表', type: [route_direction_card_dto_1.RouteDirectionCardDto] }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('month')),
    __param(2, (0, common_1.Query)('preferences')),
    __param(3, (0, common_1.Query)('pace')),
    __param(4, (0, common_1.Query)('riskTolerance')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Array, String, String]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getRouteDirectionCards", null);
__decorate([
    (0, common_1.Get)(':id/card'),
    (0, swagger_1.ApiOperation)({
        summary: '[Deprecated] 获取单个路线方向卡片',
        description: '⚠️ 已废弃，请使用 GET /:id 或 GET /interactions。根据 ID 获取路线方向卡片',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线方向 ID', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线方向卡片', type: route_direction_card_dto_1.RouteDirectionCardDto }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getRouteDirectionCardById", null);
__decorate([
    (0, common_1.Get)(':id/explainer'),
    (0, swagger_1.ApiOperation)({
        summary: '获取路线方向说明卡',
        description: '获取可解释、可对外讲、可运营的路线方向说明卡',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '路线方向 ID', type: Number }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线方向说明卡', type: Object }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getRouteDirectionExplainer", null);
__decorate([
    (0, common_1.Get)('explainers'),
    (0, swagger_1.ApiOperation)({
        summary: '获取路线方向说明卡列表',
        description: '根据国家代码获取所有路线方向的说明卡',
    }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: true, description: '国家代码' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线方向说明卡列表', type: [Object] }),
    __param(0, (0, common_1.Query)('countryCode')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getRouteDirectionExplainers", null);
__decorate([
    (0, common_1.Get)('interactions'),
    (0, swagger_1.ApiOperation)({
        summary: '获取路线方向交互列表',
        description: '返回路线方向卡片、匹配分数、解释和whyNotOthers，用于前端卡片切换',
    }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: true, description: '国家代码' }),
    (0, swagger_1.ApiQuery)({ name: 'month', required: false, description: '月份（1-12）', type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'preferences', required: false, description: '偏好标签', type: [String] }),
    (0, swagger_1.ApiQuery)({ name: 'pace', required: false, description: '节奏偏好', enum: ['relaxed', 'moderate', 'intense'] }),
    (0, swagger_1.ApiQuery)({ name: 'riskTolerance', required: false, description: '风险承受度', enum: ['low', 'medium', 'high'] }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回路线方向交互列表', type: route_direction_interaction_dto_1.RouteDirectionInteractionListDto }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('month')),
    __param(2, (0, common_1.Query)('preferences')),
    __param(3, (0, common_1.Query)('pace')),
    __param(4, (0, common_1.Query)('riskTolerance')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, Array, String, String]),
    __metadata("design:returntype", Promise)
], RouteDirectionsController.prototype, "getRouteDirectionInteractions", null);
exports.RouteDirectionsController = RouteDirectionsController = RouteDirectionsController_1 = __decorate([
    (0, swagger_1.ApiTags)('route-directions'),
    (0, common_1.Controller)('route-directions'),
    __metadata("design:paramtypes", [route_directions_service_1.RouteDirectionsService,
        route_direction_observability_service_1.RouteDirectionObservabilityService,
        route_direction_card_service_1.RouteDirectionCardService,
        route_direction_selector_service_1.RouteDirectionSelectorService,
        route_direction_explainer_service_1.RouteDirectionExplainerService])
], RouteDirectionsController);
//# sourceMappingURL=route-directions.controller.js.map