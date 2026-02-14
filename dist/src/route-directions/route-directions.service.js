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
var RouteDirectionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
let RouteDirectionsService = RouteDirectionsService_1 = class RouteDirectionsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(RouteDirectionsService_1.name);
    }
    async createRouteDirection(dto) {
        var _a, _b;
        const data = {
            countryCode: dto.countryCode,
            name: dto.name,
            nameCN: dto.nameCN,
            nameEN: dto.nameEN,
            description: dto.description,
            tags: dto.tags,
            regions: dto.regions || [],
            entryHubs: dto.entryHubs || [],
            seasonality: dto.seasonality,
            constraints: dto.constraints,
            riskProfile: dto.riskProfile,
            signaturePois: dto.signaturePois,
            itinerarySkeleton: dto.itinerarySkeleton,
            metadata: dto.metadata,
            isActive: (_a = dto.isActive) !== null && _a !== void 0 ? _a : true,
            status: dto.status || 'active',
            version: dto.version,
            rolloutPercent: (_b = dto.rolloutPercent) !== null && _b !== void 0 ? _b : 100,
            audienceFilter: dto.audienceFilter,
        };
        return this.prisma.routeDirection.create({
            data: { ...data, uuid: (0, crypto_1.randomUUID)(), updatedAt: new Date() },
        });
    }
    async createRouteTemplate(dto) {
        var _a;
        const routeDirection = await this.prisma.routeDirection.findUnique({
            where: { id: dto.routeDirectionId },
        });
        if (!routeDirection) {
            throw new common_1.NotFoundException(`Route direction with ID ${dto.routeDirectionId} not found`);
        }
        const data = {
            uuid: (0, crypto_1.randomUUID)(),
            routeDirection: {
                connect: { id: dto.routeDirectionId },
            },
            durationDays: dto.durationDays,
            name: dto.name,
            nameCN: dto.nameCN,
            nameEN: dto.nameEN,
            dayPlans: this.normalizeDayPlans(dto.dayPlans),
            defaultPacePreference: dto.defaultPacePreference,
            metadata: dto.metadata,
            isActive: (_a = dto.isActive) !== null && _a !== void 0 ? _a : true,
        };
        const template = await this.prisma.routeTemplate.create({
            data,
            include: { routeDirection: true },
        });
        template.dayPlans = this.normalizeDayPlans(template.dayPlans);
        return template;
    }
    async findRouteDirections(query) {
        const where = {};
        if (query.countryCode) {
            where.countryCode = query.countryCode;
        }
        if (query.tag) {
            where.tags = { has: query.tag };
        }
        if (query.tags && query.tags.length > 0) {
            where.tags = { hasEvery: query.tags };
        }
        if (query.isActive !== undefined) {
            where.isActive = query.isActive;
        }
        return this.prisma.routeDirection.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
    }
    async findRouteDirectionById(id) {
        const routeDirection = await this.prisma.routeDirection.findUnique({
            where: { id },
        });
        if (!routeDirection) {
            throw new common_1.NotFoundException(`Route direction with ID ${id} not found`);
        }
        return routeDirection;
    }
    async findRouteDirectionByUuid(uuid) {
        const routeDirection = await this.prisma.routeDirection.findUnique({
            where: { uuid },
            include: { templates: true },
        });
        if (!routeDirection) {
            throw new common_1.NotFoundException(`Route direction with UUID ${uuid} not found`);
        }
        return routeDirection;
    }
    async findRouteDirectionsByCountry(countryCode, options) {
        var _a;
        try {
            const activeWhere = {
                countryCode,
                OR: [
                    { status: 'active' },
                    { status: null, isActive: true },
                ],
            };
            if ((options === null || options === void 0 ? void 0 : options.tags) && options.tags.length > 0) {
                activeWhere.tags = { hasSome: options.tags };
            }
            const activeResults = await this.prisma.routeDirection.findMany({
                where: activeWhere,
                take: (options === null || options === void 0 ? void 0 : options.limit) ? options.limit * 3 : 30,
                orderBy: { createdAt: 'desc' },
            });
            const filteredActive = this.applyGrayReleaseFilter(activeResults, options);
            let finalActive = filteredActive;
            if (options === null || options === void 0 ? void 0 : options.month) {
                finalActive = filteredActive.filter(rd => {
                    const seasonality = rd.seasonality;
                    if (!seasonality)
                        return true;
                    const avoidMonths = seasonality.avoidMonths || [];
                    if (avoidMonths.includes(options.month)) {
                        return false;
                    }
                    return true;
                });
            }
            finalActive = finalActive.slice(0, (options === null || options === void 0 ? void 0 : options.limit) || 20);
            let deprecated = [];
            if (options === null || options === void 0 ? void 0 : options.includeDeprecated) {
                const deprecatedWhere = {
                    countryCode,
                    status: 'deprecated',
                };
                if ((options === null || options === void 0 ? void 0 : options.tags) && options.tags.length > 0) {
                    deprecatedWhere.tags = { hasSome: options.tags };
                }
                deprecated = await this.prisma.routeDirection.findMany({
                    where: deprecatedWhere,
                    take: 5,
                    orderBy: { updatedAt: 'desc' },
                });
            }
            return {
                active: finalActive,
                deprecated: (options === null || options === void 0 ? void 0 : options.includeDeprecated) ? deprecated : undefined,
            };
        }
        catch (error) {
            if ((error === null || error === void 0 ? void 0 : error.code) === 'P2021' || ((_a = error === null || error === void 0 ? void 0 : error.message) === null || _a === void 0 ? void 0 : _a.includes('does not exist'))) {
                this.logger.warn(`RouteDirection 表不存在，请先运行迁移`);
                return {
                    active: [],
                    deprecated: undefined,
                };
            }
            throw error;
        }
    }
    async updateRouteDirection(id, data) {
        const existing = await this.prisma.routeDirection.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new common_1.NotFoundException(`Route direction with ID ${id} not found`);
        }
        const updateData = {};
        if (data.countryCode !== undefined)
            updateData.countryCode = data.countryCode;
        if (data.name !== undefined)
            updateData.name = data.name;
        if (data.nameCN !== undefined)
            updateData.nameCN = data.nameCN;
        if (data.nameEN !== undefined)
            updateData.nameEN = data.nameEN;
        if (data.description !== undefined)
            updateData.description = data.description;
        if (data.tags !== undefined)
            updateData.tags = data.tags;
        if (data.regions !== undefined)
            updateData.regions = data.regions;
        if (data.entryHubs !== undefined)
            updateData.entryHubs = data.entryHubs;
        if (data.seasonality !== undefined)
            updateData.seasonality = data.seasonality;
        if (data.constraints !== undefined)
            updateData.constraints = data.constraints;
        if (data.riskProfile !== undefined)
            updateData.riskProfile = data.riskProfile;
        if (data.signaturePois !== undefined)
            updateData.signaturePois = data.signaturePois;
        if (data.itinerarySkeleton !== undefined)
            updateData.itinerarySkeleton = data.itinerarySkeleton;
        if (data.metadata !== undefined)
            updateData.metadata = data.metadata;
        if (data.isActive !== undefined)
            updateData.isActive = data.isActive;
        if (data.status !== undefined)
            updateData.status = data.status;
        if (data.version !== undefined)
            updateData.version = data.version;
        if (data.rolloutPercent !== undefined)
            updateData.rolloutPercent = data.rolloutPercent;
        if (data.audienceFilter !== undefined)
            updateData.audienceFilter = data.audienceFilter;
        if (data.failureProfile !== undefined)
            updateData.failureProfile = data.failureProfile;
        if (data.narrative !== undefined)
            updateData.narrative = data.narrative;
        if (data.antiPersona !== undefined)
            updateData.antiPersona = data.antiPersona;
        updateData.updatedAt = new Date();
        return this.prisma.routeDirection.update({
            where: { id },
            data: updateData,
        });
    }
    async deleteRouteDirection(id) {
        await this.prisma.routeDirection.update({
            where: { id },
            data: { isActive: false },
        });
    }
    normalizeDayPlans(dayPlans) {
        if (!dayPlans || !Array.isArray(dayPlans) || dayPlans.length === 0) {
            return [];
        }
        const firstItem = dayPlans[0];
        if (typeof firstItem === 'object' && firstItem !== null && !Array.isArray(firstItem)) {
            return dayPlans.map((plan, index) => {
                var _a;
                return {
                    ...plan,
                    day: (_a = plan.day) !== null && _a !== void 0 ? _a : index + 1,
                };
            });
        }
        if (Array.isArray(firstItem)) {
            return dayPlans.map((nodes, index) => ({
                day: index + 1,
                requiredNodes: nodes || [],
            }));
        }
        return [];
    }
    async findRouteTemplateById(id) {
        const template = await this.prisma.routeTemplate.findUnique({
            where: { id },
            include: { routeDirection: true },
        });
        if (!template) {
            throw new common_1.NotFoundException(`Route template with ID ${id} not found`);
        }
        template.dayPlans = this.normalizeDayPlans(template.dayPlans);
        return template;
    }
    async getTemplateMigrationStatus(templateId) {
        const template = await this.findRouteTemplateById(templateId);
        const dayPlans = this.normalizeDayPlans(template.dayPlans);
        const dayPlanStatuses = await Promise.all(dayPlans.map(async (plan) => {
            const day = plan.day || 1;
            const requiredNodes = plan.requiredNodes || [];
            const pois = plan.pois || [];
            const hasRequiredNodes = Array.isArray(requiredNodes) && requiredNodes.length > 0;
            const hasPois = Array.isArray(pois) && pois.length > 0;
            const needsMigration = hasRequiredNodes && !hasPois;
            let missingPoiIds = [];
            if (needsMigration) {
                const nodeIds = requiredNodes
                    .map((id) => {
                    if (typeof id === 'number')
                        return id;
                    if (typeof id === 'string') {
                        const numId = parseInt(id, 10);
                        return isNaN(numId) ? null : numId;
                    }
                    return null;
                })
                    .filter((id) => id !== null);
                if (nodeIds.length > 0) {
                    const existingPlaces = await this.prisma.place.findMany({
                        where: { id: { in: nodeIds } },
                        select: { id: true },
                    });
                    const existingIds = new Set(existingPlaces.map(p => p.id));
                    missingPoiIds = nodeIds.filter(id => !existingIds.has(id));
                }
            }
            return {
                day,
                theme: plan.theme,
                hasRequiredNodes,
                requiredNodesCount: requiredNodes.length,
                hasPois,
                poisCount: pois.length,
                needsMigration,
                ...(missingPoiIds.length > 0 && { missingPoiIds }),
            };
        }));
        const needsMigration = dayPlanStatuses.some(status => status.needsMigration);
        return {
            templateId: template.id,
            templateName: template.nameCN || template.name || 'Unnamed',
            usesOldFormat: needsMigration,
            dayPlans: dayPlanStatuses,
            needsMigration,
        };
    }
    async getAvailablePoisByTemplate(templateId, options) {
        const template = await this.findRouteTemplateById(templateId);
        const routeDirection = template.routeDirection;
        if (!routeDirection) {
            throw new common_1.NotFoundException(`Route direction not found for template ${templateId}`);
        }
        const countryCode = routeDirection.countryCode;
        if (!countryCode) {
            throw new common_1.BadRequestException(`Country code not found for route direction ${routeDirection.id}`);
        }
        const page = (options === null || options === void 0 ? void 0 : options.page) || 1;
        const limit = Math.min((options === null || options === void 0 ? void 0 : options.limit) || 50, 100);
        const skip = (page - 1) * limit;
        const where = {
            OR: [
                { City: { countryCode } },
                { metadata: { path: ['countryCode'], equals: countryCode } },
            ],
        };
        if (options === null || options === void 0 ? void 0 : options.category) {
            where.category = options.category;
        }
        if (options === null || options === void 0 ? void 0 : options.search) {
            const searchCondition = {
                OR: [
                    { nameCN: { contains: options.search, mode: 'insensitive' } },
                    { nameEN: { contains: options.search, mode: 'insensitive' } },
                    { address: { contains: options.search, mode: 'insensitive' } },
                ],
            };
            where.AND = [
                {
                    OR: [
                        { City: { countryCode } },
                        { metadata: { path: ['countryCode'], equals: countryCode } },
                    ],
                },
                searchCondition,
            ];
        }
        try {
            const [total, places] = await Promise.all([
                this.prisma.place.count({ where }),
                this.prisma.place.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { rating: 'desc' },
                    include: {
                        City: {
                            select: {
                                id: true,
                                name: true,
                                countryCode: true,
                            },
                        },
                    },
                }),
            ]);
            const placeIds = places.map(p => p.id);
            const locationMap = new Map();
            if (placeIds.length > 0) {
                try {
                    const locationResults = await this.prisma.$queryRaw `
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${placeIds}::int[]) AND location IS NOT NULL
          `;
                    locationResults.forEach(result => {
                        locationMap.set(result.id, {
                            lat: Number(result.lat),
                            lng: Number(result.lng),
                        });
                    });
                }
                catch (error) {
                    this.logger.warn(`批量提取坐标失败: ${error.message}`);
                }
            }
            const placeList = places.map(place => {
                const coords = locationMap.get(place.id) || null;
                const city = place.City;
                return {
                    id: place.id,
                    uuid: place.uuid,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN,
                    category: place.category,
                    rating: place.rating,
                    location: coords ? { lat: coords.lat, lng: coords.lng } : null,
                    city: city ? {
                        id: city.id,
                        name: city.name,
                        countryCode: city.countryCode,
                    } : null,
                };
            });
            return {
                places: placeList,
                total,
                page,
                limit,
                routeDirection: {
                    id: routeDirection.id,
                    countryCode: routeDirection.countryCode,
                    nameCN: routeDirection.nameCN,
                },
            };
        }
        catch (error) {
            this.logger.error(`获取可用POI列表失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async findRouteTemplateByDirectionAndDuration(routeDirectionId, durationDays) {
        return this.prisma.routeTemplate.findFirst({
            where: {
                routeDirectionId,
                durationDays,
                isActive: true,
            },
            include: { routeDirection: true },
        });
    }
    async findRouteTemplates(options) {
        const where = {};
        if ((options === null || options === void 0 ? void 0 : options.routeDirectionId) !== undefined) {
            where.routeDirectionId = options.routeDirectionId;
        }
        if ((options === null || options === void 0 ? void 0 : options.durationDays) !== undefined) {
            where.durationDays = options.durationDays;
        }
        if ((options === null || options === void 0 ? void 0 : options.isActive) !== undefined) {
            where.isActive = options.isActive;
        }
        const query = {
            where,
            include: { routeDirection: true },
            orderBy: { createdAt: 'desc' },
        };
        if ((options === null || options === void 0 ? void 0 : options.limit) !== undefined) {
            query.take = options.limit;
        }
        if ((options === null || options === void 0 ? void 0 : options.offset) !== undefined) {
            query.skip = options.offset;
        }
        const templates = await this.prisma.routeTemplate.findMany(query);
        return templates.map(template => ({
            ...template,
            dayPlans: this.normalizeDayPlans(template.dayPlans),
        }));
    }
    async updateRouteTemplate(id, dto) {
        const existing = await this.prisma.routeTemplate.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new common_1.NotFoundException(`Route template with ID ${id} not found`);
        }
        if (dto.routeDirectionId !== undefined) {
            const routeDirection = await this.prisma.routeDirection.findUnique({
                where: { id: dto.routeDirectionId },
            });
            if (!routeDirection) {
                throw new common_1.NotFoundException(`Route direction with ID ${dto.routeDirectionId} not found`);
            }
        }
        const updateData = {};
        if (dto.routeDirectionId !== undefined) {
            updateData.routeDirection = {
                connect: { id: dto.routeDirectionId },
            };
        }
        if (dto.durationDays !== undefined)
            updateData.durationDays = dto.durationDays;
        if (dto.name !== undefined)
            updateData.name = dto.name;
        if (dto.nameCN !== undefined)
            updateData.nameCN = dto.nameCN;
        if (dto.nameEN !== undefined)
            updateData.nameEN = dto.nameEN;
        if (dto.dayPlans !== undefined) {
            this.logger.debug(`Original dayPlans input for template ${id}:`, JSON.stringify(dto.dayPlans, null, 2));
            dto.dayPlans.forEach((plan, index) => {
                if (!plan.requiredNodes || (Array.isArray(plan.requiredNodes) && plan.requiredNodes.length === 0)) {
                    this.logger.warn(`⚠️  Day ${plan.day || index + 1} has empty requiredNodes in input data`);
                }
            });
            const normalizedDayPlans = this.normalizeDayPlans(dto.dayPlans);
            normalizedDayPlans.forEach((plan, index) => {
                if (!plan.pois || (Array.isArray(plan.pois) && plan.pois.length === 0)) {
                    this.logger.warn(`⚠️  Day ${plan.day || index + 1} has no pois after normalization. Please use pois array format.`);
                }
            });
            this.logger.debug(`Normalized dayPlans for template ${id}:`, JSON.stringify(normalizedDayPlans, null, 2));
            updateData.dayPlans = normalizedDayPlans;
        }
        if (dto.defaultPacePreference !== undefined) {
            updateData.defaultPacePreference = dto.defaultPacePreference;
        }
        if (dto.metadata !== undefined) {
            updateData.metadata = dto.metadata;
        }
        if (dto.isActive !== undefined)
            updateData.isActive = dto.isActive;
        updateData.updatedAt = new Date();
        if (updateData.dayPlans) {
            this.logger.debug(`About to save dayPlans to database for template ${id}:`, JSON.stringify(updateData.dayPlans, null, 2));
        }
        const updated = await this.prisma.routeTemplate.update({
            where: { id },
            data: updateData,
            include: { routeDirection: true },
        });
        this.logger.debug(`Database returned dayPlans for template ${id}:`, JSON.stringify(updated.dayPlans, null, 2));
        updated.dayPlans = this.normalizeDayPlans(updated.dayPlans);
        this.logger.debug(`Normalized return dayPlans for template ${id}:`, JSON.stringify(updated.dayPlans, null, 2));
        return updated;
    }
    async deleteRouteTemplate(id) {
        const existing = await this.prisma.routeTemplate.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new common_1.NotFoundException(`Route template with ID ${id} not found`);
        }
        await this.prisma.routeTemplate.update({
            where: { id },
            data: {
                isActive: false,
                updatedAt: new Date(),
            },
        });
    }
    async hardDeleteRouteTemplate(id) {
        const existing = await this.prisma.routeTemplate.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new common_1.NotFoundException(`Route template with ID ${id} not found`);
        }
        await this.prisma.routeTemplate.delete({
            where: { id },
        });
    }
    async addPoiToTemplate(templateId, dto) {
        var _a;
        const template = await this.prisma.routeTemplate.findUnique({
            where: { id: templateId },
        });
        if (!template) {
            throw new common_1.NotFoundException(`Route template with ID ${templateId} not found`);
        }
        const place = await this.prisma.place.findUnique({
            where: { id: dto.poiId },
            select: {
                id: true,
                uuid: true,
                nameCN: true,
                nameEN: true,
                category: true,
                address: true,
                rating: true,
                description: true,
            },
        });
        if (!place) {
            throw new common_1.NotFoundException(`Place with ID ${dto.poiId} not found`);
        }
        const dayPlans = this.normalizeDayPlans(template.dayPlans);
        const dayPlan = dayPlans.find((dp) => dp.day === dto.day);
        if (!dayPlan) {
            throw new common_1.NotFoundException(`Day ${dto.day} not found in route template`);
        }
        const existingPois = dayPlan.pois || [];
        const existingPoi = existingPois.find((p) => p.id === dto.poiId || p.uuid === place.uuid);
        if (existingPoi) {
            throw new common_1.BadRequestException(`POI ${place.nameCN} (ID: ${dto.poiId}) already exists in day ${dto.day}`);
        }
        const priority = dto.priority || (dto.required ? 'MUST_SEE' : 'MEDIUM');
        const required = (_a = dto.required) !== null && _a !== void 0 ? _a : (priority === 'MUST_SEE');
        const newPoi = {
            id: place.id,
            uuid: place.uuid,
            nameCN: place.nameCN,
            nameEN: place.nameEN || undefined,
            category: place.category,
            required,
            priority,
            order: dto.order || existingPois.length + 1,
        };
        if (place.address)
            newPoi.address = place.address;
        if (place.rating)
            newPoi.rating = place.rating;
        if (place.description)
            newPoi.description = place.description;
        if (dto.startTime)
            newPoi.startTime = dto.startTime;
        if (dto.endTime)
            newPoi.endTime = dto.endTime;
        if (dto.durationMinutes)
            newPoi.durationMinutes = dto.durationMinutes;
        if (dto.priorityReason)
            newPoi.priorityReason = dto.priorityReason;
        existingPois.push(newPoi);
        dayPlan.pois = existingPois;
        const updatedTemplate = await this.prisma.routeTemplate.update({
            where: { id: templateId },
            data: {
                dayPlans: dayPlans,
                updatedAt: new Date(),
            },
            include: {
                routeDirection: true,
            },
        });
        updatedTemplate.dayPlans = this.normalizeDayPlans(updatedTemplate.dayPlans);
        const routeDirection = await this.prisma.routeDirection.findUnique({
            where: { id: template.routeDirectionId },
            select: { signaturePois: true },
        });
        if (routeDirection) {
            const currentSigPois = routeDirection.signaturePois || {};
            const existingExamples = currentSigPois.examples || [];
            if (!existingExamples.includes(place.id)) {
                const allExamples = [...existingExamples, place.id];
                await this.prisma.routeDirection.update({
                    where: { id: template.routeDirectionId },
                    data: {
                        signaturePois: {
                            ...currentSigPois,
                            examples: allExamples,
                        },
                    },
                });
            }
        }
        return updatedTemplate;
    }
    async removePoiFromTemplate(templateId, dto) {
        const template = await this.prisma.routeTemplate.findUnique({
            where: { id: templateId },
        });
        if (!template) {
            throw new common_1.NotFoundException(`Route template with ID ${templateId} not found`);
        }
        const dayPlans = this.normalizeDayPlans(template.dayPlans);
        const dayPlan = dayPlans.find((dp) => dp.day === dto.day);
        if (!dayPlan) {
            throw new common_1.NotFoundException(`Day ${dto.day} not found in route template`);
        }
        const existingPois = dayPlan.pois || [];
        let poiToRemove = null;
        let removeIndex = -1;
        if (dto.index !== undefined) {
            if (dto.index < 0 || dto.index >= existingPois.length) {
                throw new common_1.BadRequestException(`Index ${dto.index} is out of range. Day ${dto.day} has ${existingPois.length} POIs.`);
            }
            removeIndex = dto.index;
            poiToRemove = existingPois[removeIndex];
        }
        else if (dto.poiId) {
            removeIndex = existingPois.findIndex((p) => p.id === dto.poiId);
            if (removeIndex === -1) {
                throw new common_1.NotFoundException(`POI with ID ${dto.poiId} not found in day ${dto.day}`);
            }
            poiToRemove = existingPois[removeIndex];
        }
        else if (dto.poiUuid) {
            removeIndex = existingPois.findIndex((p) => p.uuid === dto.poiUuid);
            if (removeIndex === -1) {
                throw new common_1.NotFoundException(`POI with UUID ${dto.poiUuid} not found in day ${dto.day}`);
            }
            poiToRemove = existingPois[removeIndex];
        }
        else {
            throw new common_1.BadRequestException('Please provide poiId, poiUuid, or index');
        }
        const updatedPois = existingPois.filter((_, idx) => idx !== removeIndex);
        dayPlan.pois = updatedPois.length > 0 ? updatedPois : undefined;
        const updatedTemplate = await this.prisma.routeTemplate.update({
            where: { id: templateId },
            data: {
                dayPlans: dayPlans,
                updatedAt: new Date(),
            },
            include: {
                routeDirection: true,
            },
        });
        updatedTemplate.dayPlans = this.normalizeDayPlans(updatedTemplate.dayPlans);
        return {
            template: updatedTemplate,
            removedPoi: poiToRemove,
        };
    }
    async updatePoiInTemplate(templateId, dto) {
        const template = await this.prisma.routeTemplate.findUnique({
            where: { id: templateId },
        });
        if (!template) {
            throw new common_1.NotFoundException(`Route template with ID ${templateId} not found`);
        }
        const dayPlans = this.normalizeDayPlans(template.dayPlans);
        const dayPlan = dayPlans.find((dp) => dp.day === dto.day);
        if (!dayPlan) {
            throw new common_1.NotFoundException(`Day ${dto.day} not found in route template`);
        }
        const existingPois = dayPlan.pois || [];
        const poiIndex = existingPois.findIndex((p) => p.id === dto.poiId);
        if (poiIndex === -1) {
            throw new common_1.NotFoundException(`POI with ID ${dto.poiId} not found in day ${dto.day}`);
        }
        const existingPoi = existingPois[poiIndex];
        if (dto.priority !== undefined) {
            existingPoi.priority = dto.priority;
            if (dto.required === undefined) {
                existingPoi.required = dto.priority === 'MUST_SEE';
            }
        }
        if (dto.required !== undefined) {
            existingPoi.required = dto.required;
            if (dto.priority === undefined && existingPoi.priority === undefined) {
                existingPoi.priority = dto.required ? 'MUST_SEE' : 'MEDIUM';
            }
        }
        if (dto.startTime !== undefined) {
            existingPoi.startTime = dto.startTime;
        }
        if (dto.endTime !== undefined) {
            existingPoi.endTime = dto.endTime;
        }
        if (dto.durationMinutes !== undefined) {
            existingPoi.durationMinutes = dto.durationMinutes;
        }
        if (dto.priorityReason !== undefined) {
            existingPoi.priorityReason = dto.priorityReason;
        }
        dayPlan.pois = existingPois;
        const updatedTemplate = await this.prisma.routeTemplate.update({
            where: { id: templateId },
            data: {
                dayPlans: dayPlans,
                updatedAt: new Date(),
            },
            include: {
                routeDirection: true,
            },
        });
        updatedTemplate.dayPlans = this.normalizeDayPlans(updatedTemplate.dayPlans);
        return {
            template: updatedTemplate,
            updatedPoi: existingPoi,
        };
    }
    async bulkUpdatePoiPriority(templateId, updates) {
        const template = await this.prisma.routeTemplate.findUnique({
            where: { id: templateId },
        });
        if (!template) {
            throw new common_1.NotFoundException(`Route template with ID ${templateId} not found`);
        }
        const dayPlans = this.normalizeDayPlans(template.dayPlans);
        const updatedPois = [];
        const errors = [];
        for (const update of updates) {
            const dayPlan = dayPlans.find((dp) => dp.day === update.day);
            if (!dayPlan) {
                errors.push(`Day ${update.day} not found`);
                continue;
            }
            const existingPois = dayPlan.pois || [];
            const poi = existingPois.find((p) => p.id === update.poiId);
            if (!poi) {
                errors.push(`POI ${update.poiId} not found in day ${update.day}`);
                continue;
            }
            poi.priority = update.priority;
            poi.required = update.priority === 'MUST_SEE';
            if (update.priorityReason) {
                poi.priorityReason = update.priorityReason;
            }
            updatedPois.push({ day: update.day, poi });
        }
        const updatedTemplate = await this.prisma.routeTemplate.update({
            where: { id: templateId },
            data: {
                dayPlans: dayPlans,
                updatedAt: new Date(),
            },
            include: {
                routeDirection: true,
            },
        });
        updatedTemplate.dayPlans = this.normalizeDayPlans(updatedTemplate.dayPlans);
        return {
            template: updatedTemplate,
            updatedPois,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    applyGrayReleaseFilter(routeDirections, options) {
        return routeDirections.filter(rd => {
            var _a;
            const rolloutPercent = (_a = rd.rolloutPercent) !== null && _a !== void 0 ? _a : 100;
            if (rolloutPercent < 100) {
                if (!(options === null || options === void 0 ? void 0 : options.userId)) {
                    return false;
                }
                const hash = this.hashString(options.userId);
                const userHashPercent = (hash % 100) + 1;
                if (userHashPercent > rolloutPercent) {
                    return false;
                }
            }
            const audienceFilter = rd.audienceFilter;
            if (audienceFilter) {
                if (audienceFilter.persona && Array.isArray(audienceFilter.persona)) {
                    if ((options === null || options === void 0 ? void 0 : options.persona) && options.persona.length > 0) {
                        const hasMatch = options.persona.some(p => audienceFilter.persona.includes(p));
                        if (!hasMatch) {
                            return false;
                        }
                    }
                    else {
                        return false;
                    }
                }
                if (audienceFilter.locale && Array.isArray(audienceFilter.locale)) {
                    if (options === null || options === void 0 ? void 0 : options.locale) {
                        const hasMatch = audienceFilter.locale.includes(options.locale);
                        if (!hasMatch) {
                            return false;
                        }
                    }
                    else {
                        return false;
                    }
                }
            }
            return true;
        });
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
    async importCountryPack(dto) {
        const results = [];
        let successCount = 0;
        let failedCount = 0;
        this.logger.log(`开始导入 ${dto.countryCode} 的 Country Pack，包含 ${dto.routeDirections.length} 条 RouteDirection`);
        for (const routeDirectionDto of dto.routeDirections) {
            try {
                if (routeDirectionDto.countryCode !== dto.countryCode) {
                    this.logger.warn(`RouteDirection ${routeDirectionDto.name} 的 countryCode (${routeDirectionDto.countryCode}) 与 Pack 的 countryCode (${dto.countryCode}) 不匹配，使用 Pack 的 countryCode`);
                    routeDirectionDto.countryCode = dto.countryCode;
                }
                const created = await this.createRouteDirection(routeDirectionDto);
                results.push({
                    name: routeDirectionDto.name,
                    success: true,
                    id: created.id,
                });
                successCount++;
                this.logger.log(`✅ 成功导入 RouteDirection: ${routeDirectionDto.name} (ID: ${created.id})`);
            }
            catch (error) {
                const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error';
                results.push({
                    name: routeDirectionDto.name,
                    success: false,
                    error: errorMessage,
                });
                failedCount++;
                this.logger.error(`❌ 导入 RouteDirection 失败: ${routeDirectionDto.name}`, errorMessage);
            }
        }
        this.logger.log(`Country Pack 导入完成: ${dto.countryCode} - 成功: ${successCount}, 失败: ${failedCount}`);
        return {
            countryCode: dto.countryCode,
            successCount,
            failedCount,
            results,
        };
    }
    async createTripFromTemplate(templateId, dto, userId) {
        var _a;
        const template = await this.findRouteTemplateById(templateId);
        if (!template) {
            throw new common_1.NotFoundException(`Route template with ID ${templateId} not found`);
        }
        const routeDirection = template.routeDirection;
        if (!routeDirection) {
            throw new common_1.NotFoundException(`Route direction not found for template ${templateId}`);
        }
        const dayPlans = this.normalizeDayPlans(template.dayPlans);
        const durationDays = template.durationDays;
        this.logger.debug(`Template ${templateId} dayPlans after normalization:`, JSON.stringify(dayPlans, null, 2));
        let totalPois = 0;
        dayPlans.forEach((plan, index) => {
            const pois = plan.pois || [];
            totalPois += pois.length;
            if (pois.length > 0) {
                this.logger.debug(`Day ${plan.day || index + 1} has ${pois.length} POIs:`, JSON.stringify(pois.map((p) => ({ id: p.id, uuid: p.uuid, nameCN: p.nameCN, required: p.required })), null, 2));
            }
        });
        this.logger.debug(`Total POIs in template: ${totalPois}`);
        const startDate = new Date(dto.startDate);
        const endDate = new Date(dto.endDate);
        const actualDays = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (actualDays !== durationDays) {
            this.logger.warn(`Template duration (${durationDays}) does not match actual days (${actualDays}). Using actual days.`);
        }
        const countryCode = dto.destination.toUpperCase().trim();
        this.logger.debug(`Retrieving place candidates for country ${countryCode} with ${totalPois} POIs from template`);
        const candidates = await this.retrievePlaceCandidates(countryCode, dayPlans, routeDirection);
        this.logger.debug(`Retrieved ${candidates.length} candidates, ${candidates.filter(c => c.isRequired).length} are required`);
        if (candidates.length === 0) {
            throw new common_1.NotFoundException(`No places found for destination ${countryCode}. Please ensure place data exists.`);
        }
        const llmResult = await this.orchestrateWithLLM(template, dto, candidates, startDate, durationDays);
        const tripName = ((_a = dto.name) === null || _a === void 0 ? void 0 : _a.trim()) || this.generateDefaultTripName({
            destination: countryCode,
            startDate: dto.startDate,
        });
        return await this.prisma.$transaction(async (tx) => {
            var _a;
            const trip = await tx.trip.create({
                data: {
                    id: (0, crypto_1.randomUUID)(),
                    name: tripName,
                    destination: countryCode,
                    startDate: startDate,
                    endDate: endDate,
                    status: 'PLANNING',
                    budgetConfig: {
                        totalBudget: dto.totalBudget || 0,
                        currency: 'CNY',
                    },
                    pacingConfig: {
                        pacePreference: dto.pacePreference || template.defaultPacePreference || 'BALANCED',
                        intensity: dto.intensity || 'balanced',
                        transport: dto.transport || 'car',
                    },
                    metadata: {
                        createdFromTemplate: templateId,
                        templateName: template.nameCN || template.name,
                    },
                    updatedAt: new Date(),
                },
            });
            if (userId) {
                try {
                    await tx.tripCollaborator.create({
                        data: {
                            id: (0, crypto_1.randomUUID)(),
                            tripId: trip.id,
                            userId: userId,
                            role: 'OWNER',
                            updatedAt: new Date(),
                        },
                    });
                    this.logger.debug(`Created TripCollaborator for trip ${trip.id} with userId ${userId}`);
                }
                catch (error) {
                    this.logger.warn(`Failed to create TripCollaborator for trip ${trip.id}: ${error.message}`);
                }
            }
            else {
                this.logger.warn(`No userId provided when creating trip from template ${templateId}. Trip will not be associated with any user.`);
            }
            const tripDays = [];
            const dayThemes = {};
            for (let i = 0; i < durationDays; i++) {
                const dayDate = new Date(startDate);
                dayDate.setDate(dayDate.getDate() + i);
                const dayNumber = i + 1;
                const dayResult = (_a = llmResult.days) === null || _a === void 0 ? void 0 : _a.find(d => d.day === dayNumber);
                const dayPlan = dayPlans.find(p => p.day === dayNumber) || dayPlans[i];
                const theme = (dayResult === null || dayResult === void 0 ? void 0 : dayResult.theme) || (dayPlan === null || dayPlan === void 0 ? void 0 : dayPlan.theme) || '';
                dayThemes[dayNumber] = theme;
                if (!theme) {
                    this.logger.warn(`Day ${dayNumber} has no theme. dayResult.theme=${dayResult === null || dayResult === void 0 ? void 0 : dayResult.theme}, dayPlan.theme=${dayPlan === null || dayPlan === void 0 ? void 0 : dayPlan.theme}`);
                }
                else {
                    this.logger.debug(`Day ${dayNumber} theme: ${theme}`);
                }
                const tripDay = await tx.tripDay.create({
                    data: {
                        id: (0, crypto_1.randomUUID)(),
                        tripId: trip.id,
                        date: dayDate,
                    },
                });
                tripDays.push(tripDay);
            }
            const existingMetadata = trip.metadata || {};
            const updatedMetadata = {
                ...existingMetadata,
                dayThemes: dayThemes,
            };
            await tx.trip.update({
                where: { id: trip.id },
                data: { metadata: updatedMetadata },
            });
            trip.metadata = updatedMetadata;
            this.logger.debug(`Saved dayThemes to Trip metadata:`, JSON.stringify(dayThemes));
            const itemsToCreate = [];
            let placesMatched = 0;
            let placesMissing = 0;
            const candidateIds = candidates.map(c => c.id);
            const candidateCoordsMap = new Map();
            if (candidateIds.length > 0) {
                try {
                    const locationResults = await tx.$queryRaw `
            SELECT 
              id,
              ST_Y(location::geometry) as lat,
              ST_X(location::geometry) as lng
            FROM "Place"
            WHERE id = ANY(${candidateIds}::int[]) AND location IS NOT NULL
          `;
                    locationResults.forEach(result => {
                        candidateCoordsMap.set(result.id, {
                            lat: Number(result.lat),
                            lng: Number(result.lng),
                        });
                    });
                }
                catch (error) {
                    this.logger.warn(`批量提取坐标失败: ${error.message}`);
                }
            }
            let previousItemEndTime = null;
            let previousPlaceCoords = null;
            for (const dayResult of llmResult.days || []) {
                const tripDay = tripDays[dayResult.day - 1];
                if (!tripDay)
                    continue;
                const dayDate = new Date(tripDay.date);
                const slots = dayResult.slots || {};
                if (previousItemEndTime && new Date(previousItemEndTime).toDateString() !== dayDate.toDateString()) {
                    previousItemEndTime = null;
                    previousPlaceCoords = null;
                }
                const dayItems = [];
                const slotOrder = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'];
                for (const slot of slotOrder) {
                    const slotData = slots[slot];
                    if (!slotData || !slotData.placeId) {
                        if (slotData === null || slotData === void 0 ? void 0 : slotData.required) {
                            placesMissing++;
                        }
                        continue;
                    }
                    const candidate = candidates.find(c => c.id === slotData.placeId);
                    if (!candidate) {
                        this.logger.warn(`Place ID ${slotData.placeId} not found in candidates, skipping`);
                        placesMissing++;
                        continue;
                    }
                    placesMatched++;
                    let startTime;
                    let endTime;
                    if (slotData.startTime && slotData.endTime) {
                        const templateStartTime = new Date(slotData.startTime);
                        const templateEndTime = new Date(slotData.endTime);
                        if (isNaN(templateStartTime.getTime()) || isNaN(templateEndTime.getTime())) {
                            const startMatch = slotData.startTime.match(/(\d{1,2}):(\d{2})/);
                            const endMatch = slotData.endTime.match(/(\d{1,2}):(\d{2})/);
                            if (startMatch && endMatch) {
                                const [, startHour, startMin] = startMatch.map(Number);
                                const [, endHour, endMin] = endMatch.map(Number);
                                startTime = new Date(dayDate);
                                startTime.setHours(startHour, startMin, 0, 0);
                                endTime = new Date(dayDate);
                                endTime.setHours(endHour, endMin, 0, 0);
                            }
                            else {
                                const slotDefaultTime = this.calculateSlotTime(dayDate, slot);
                                startTime = slotDefaultTime.startTime;
                                endTime = slotDefaultTime.endTime;
                            }
                        }
                        else {
                            startTime = templateStartTime;
                            endTime = templateEndTime;
                        }
                    }
                    else {
                        const slotDefaultTime = this.calculateSlotTime(dayDate, slot);
                        const currentPlaceCoords = candidateCoordsMap.get(slotData.placeId);
                        if (previousItemEndTime && previousPlaceCoords && currentPlaceCoords) {
                            const travelTimeMinutes = this.calculateTravelTimeBetweenPlaces(previousPlaceCoords, currentPlaceCoords);
                            const bufferMinutes = 15;
                            const calculatedStartTime = new Date(previousItemEndTime.getTime() + (travelTimeMinutes + bufferMinutes) * 60 * 1000);
                            if (calculatedStartTime < slotDefaultTime.startTime) {
                                startTime = slotDefaultTime.startTime;
                            }
                            else if (calculatedStartTime >= slotDefaultTime.endTime) {
                                this.logger.warn(`Calculated start time ${calculatedStartTime.toISOString()} exceeds slot end time for ${slot}, using slot default start time`);
                                startTime = slotDefaultTime.startTime;
                            }
                            else {
                                startTime = calculatedStartTime;
                            }
                            const durationMinutes = slotData.durationMinutes
                                || this.getActivityDuration(slot, candidate.category);
                            endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);
                            if (endTime > slotDefaultTime.endTime) {
                                const maxDuration = (slotDefaultTime.endTime.getTime() - startTime.getTime()) / (60 * 1000);
                                if (maxDuration > 30) {
                                    endTime = slotDefaultTime.endTime;
                                }
                                else {
                                    startTime = slotDefaultTime.startTime;
                                    endTime = slotDefaultTime.endTime;
                                }
                            }
                        }
                        else {
                            startTime = slotDefaultTime.startTime;
                            endTime = slotDefaultTime.endTime;
                            if (slotData.durationMinutes) {
                                endTime = new Date(startTime.getTime() + slotData.durationMinutes * 60 * 1000);
                            }
                        }
                    }
                    let note = slotData.reason || null;
                    if (slotData.required) {
                        note = note ? `${note} [必游]` : '[必游]';
                    }
                    dayItems.push({
                        id: (0, crypto_1.randomUUID)(),
                        tripDayId: tripDay.id,
                        placeId: slotData.placeId,
                        type: this.mapSlotToItemType(slot, candidate.category),
                        startTime: startTime,
                        endTime: endTime,
                        note: note,
                    });
                    previousItemEndTime = endTime;
                    const currentPlaceCoordsForNext = candidateCoordsMap.get(slotData.placeId);
                    previousPlaceCoords = currentPlaceCoordsForNext || null;
                }
                dayItems.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
                itemsToCreate.push(...dayItems);
            }
            if (itemsToCreate.length > 0) {
                await tx.itineraryItem.createMany({
                    data: itemsToCreate,
                });
            }
            return {
                trip: {
                    id: trip.id,
                    destination: trip.destination,
                    startDate: trip.startDate,
                    endDate: trip.endDate,
                    totalBudget: dto.totalBudget || 0,
                    status: 'PLANNING',
                    pacingConfig: trip.pacingConfig,
                    budgetConfig: trip.budgetConfig,
                },
                generatedItems: tripDays.map((tripDay, index) => ({
                    day: index + 1,
                    date: tripDay.date.toISOString().split('T')[0],
                    items: itemsToCreate
                        .filter(item => item.tripDayId === tripDay.id)
                        .map(item => ({
                        placeId: item.placeId,
                        type: item.type,
                        startTime: item.startTime.toISOString(),
                        endTime: item.endTime.toISOString(),
                        note: item.note,
                        reason: item.note,
                    })),
                })),
                stats: {
                    totalDays: durationDays,
                    totalItems: itemsToCreate.length,
                    placesMatched,
                    placesMissing,
                },
                warnings: placesMissing > 0
                    ? [`${placesMissing} required places could not be matched`]
                    : undefined,
            };
        });
    }
    async retrievePlaceCandidates(countryCode, dayPlans, routeDirection) {
        const poisFromTemplate = [];
        const poisIdSet = new Set();
        const poisUuidSet = new Set();
        for (const plan of dayPlans) {
            if (plan.pois && Array.isArray(plan.pois) && plan.pois.length > 0) {
                this.logger.debug(`Found ${plan.pois.length} POIs in day ${plan.day || 'unknown'}`);
                for (const poi of plan.pois) {
                    if (poi.id) {
                        poisIdSet.add(poi.id);
                        poisFromTemplate.push({
                            id: poi.id,
                            uuid: poi.uuid,
                            required: poi.required || false,
                        });
                        this.logger.debug(`Added POI: id=${poi.id}, uuid=${poi.uuid}, required=${poi.required || false}`);
                    }
                    else if (poi.uuid) {
                        poisUuidSet.add(poi.uuid);
                        poisFromTemplate.push({
                            uuid: poi.uuid,
                            required: poi.required || false,
                        });
                        this.logger.debug(`Added POI: uuid=${poi.uuid}, required=${poi.required || false}`);
                    }
                    else {
                        this.logger.warn(`POI in day ${plan.day} has neither id nor uuid:`, JSON.stringify(poi));
                    }
                }
            }
            else {
                this.logger.debug(`Day ${plan.day || 'unknown'} has no pois array or pois is empty`);
            }
        }
        if (poisFromTemplate.length > 0) {
            const poiIds = Array.from(poisIdSet);
            const poiUuids = Array.from(poisUuidSet);
            this.logger.debug(`Querying places: ${poiIds.length} IDs, ${poiUuids.length} UUIDs`);
            const places = await this.prisma.$queryRaw `
        SELECT 
          p.id,
          p.uuid,
          p."nameCN",
          p."nameEN",
          p.category,
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng
        FROM "Place" p
        ${countryCode ? client_1.Prisma.sql `INNER JOIN "City" c ON p."cityId" = c.id` : client_1.Prisma.sql ``}
        WHERE 
          ${countryCode ? client_1.Prisma.sql `c."countryCode" = ${countryCode} AND` : client_1.Prisma.sql ``}
          p.location IS NOT NULL
          AND (
            ${poiIds.length > 0 && poiUuids.length > 0
                ? client_1.Prisma.sql `(p.id = ANY(${poiIds}::int[]) OR p.uuid = ANY(${poiUuids}::text[]))`
                : poiIds.length > 0
                    ? client_1.Prisma.sql `p.id = ANY(${poiIds}::int[])`
                    : poiUuids.length > 0
                        ? client_1.Prisma.sql `p.uuid = ANY(${poiUuids}::text[])`
                        : client_1.Prisma.sql `FALSE`}
          )
      `;
            this.logger.debug(`Found ${places.length} places in database (expected ${poisFromTemplate.length})`);
            if (places.length < poisFromTemplate.length) {
                const foundIds = new Set(places.map(p => p.id));
                const foundUuids = new Set(places.map(p => p.uuid));
                const missingPois = poisFromTemplate.filter(poi => {
                    if (poi.id)
                        return !foundIds.has(poi.id);
                    if (poi.uuid)
                        return !foundUuids.has(poi.uuid);
                    return true;
                });
                this.logger.warn(`Missing ${missingPois.length} POIs in database:`, JSON.stringify(missingPois, null, 2));
            }
            const requiredMap = new Map();
            poisFromTemplate.forEach(poi => {
                if (poi.id)
                    requiredMap.set(poi.id, poi.required || false);
                if (poi.uuid)
                    requiredMap.set(poi.uuid, poi.required || false);
            });
            const foundPlaceIds = new Set(places.map(p => p.id));
            const foundPlaceUuids = new Set(places.map(p => p.uuid));
            const otherPlaces = foundPlaceIds.size > 0 || foundPlaceUuids.size > 0
                ? await this.prisma.$queryRaw `
            SELECT 
              p.id,
              p.uuid,
              p."nameCN",
              p."nameEN",
              p.category,
              ST_Y(p.location::geometry) as lat,
              ST_X(p.location::geometry) as lng
            FROM "Place" p
            ${countryCode ? client_1.Prisma.sql `INNER JOIN "City" c ON p."cityId" = c.id` : client_1.Prisma.sql ``}
            WHERE 
              ${countryCode ? client_1.Prisma.sql `c."countryCode" = ${countryCode} AND` : client_1.Prisma.sql ``}
              p.location IS NOT NULL
              ${foundPlaceIds.size > 0 ? client_1.Prisma.sql `AND p.id != ALL(${Array.from(foundPlaceIds)}::int[])` : client_1.Prisma.sql ``}
              ${foundPlaceUuids.size > 0 ? client_1.Prisma.sql `AND p.uuid != ALL(${Array.from(foundPlaceUuids)}::text[])` : client_1.Prisma.sql ``}
            ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
            LIMIT ${Math.max(0, 200 - places.length)}
          `
                : [];
            return [
                ...places.map(place => ({
                    id: place.id,
                    uuid: place.uuid,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN || undefined,
                    category: place.category,
                    lat: place.lat,
                    lng: place.lng,
                    isRequired: requiredMap.get(place.id) || requiredMap.get(place.uuid) || false,
                })),
                ...otherPlaces.map(place => ({
                    id: place.id,
                    uuid: place.uuid,
                    nameCN: place.nameCN,
                    nameEN: place.nameEN || undefined,
                    category: place.category,
                    lat: place.lat,
                    lng: place.lng,
                    isRequired: false,
                })),
            ];
        }
        this.logger.warn(`No pois found in dayPlans for template. Please use pois array format instead of requiredNodes.`);
        const requiredNodeIds = [];
        const requiredNodeNames = [];
        const requiredNodesSet = new Set();
        for (const plan of dayPlans) {
            if (plan.requiredNodes && plan.requiredNodes.length > 0) {
                for (const node of plan.requiredNodes) {
                    requiredNodesSet.add(node);
                    if (node.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
                        requiredNodeIds.push(node);
                    }
                    else {
                        requiredNodeNames.push(node);
                    }
                }
            }
        }
        const categories = this.extractCategoriesFromDayPlans(dayPlans);
        const categorySql = categories.length > 0
            ? client_1.Prisma.sql `AND p.category = ANY(${categories}::"PlaceCategory"[])`
            : client_1.Prisma.sql ``;
        let requiredNodesSql = client_1.Prisma.sql ``;
        if (requiredNodeIds.length > 0 || requiredNodeNames.length > 0) {
            const conditions = [];
            if (requiredNodeIds.length > 0) {
                conditions.push(`p.uuid = ANY(${requiredNodeIds}::text[])`);
            }
            if (requiredNodeNames.length > 0) {
                conditions.push(`(p."nameCN" = ANY(${requiredNodeNames}::text[]) OR p."nameEN" = ANY(${requiredNodeNames}::text[]))`);
            }
            requiredNodesSql = client_1.Prisma.sql `OR (${client_1.Prisma.raw(conditions.join(' OR '))})`;
        }
        if (requiredNodeIds.length > 0 || requiredNodeNames.length > 0) {
            const requiredPlaces = await this.prisma.$queryRaw `
        SELECT 
          p.id,
          p.uuid,
          p."nameCN",
          p."nameEN",
          p.category,
          ST_Y(p.location::geometry) as lat,
          ST_X(p.location::geometry) as lng
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE c."countryCode" = ${countryCode}
          AND p.location IS NOT NULL
          ${requiredNodeIds.length > 0
                ? client_1.Prisma.sql `AND (p.uuid = ANY(${requiredNodeIds}::text[])`
                : client_1.Prisma.sql `AND (FALSE`}
          ${requiredNodeNames.length > 0
                ? client_1.Prisma.sql `OR p."nameCN" = ANY(${requiredNodeNames}::text[]) OR p."nameEN" = ANY(${requiredNodeNames}::text[]))`
                : client_1.Prisma.sql `)`}
        ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
      `;
            if (requiredPlaces.length > 0) {
                const requiredPlaceIds = requiredPlaces.map(p => p.id);
                const otherPlaces = await this.prisma.$queryRaw `
          SELECT 
            p.id,
            p.uuid,
            p."nameCN",
            p."nameEN",
            p.category,
            ST_Y(p.location::geometry) as lat,
            ST_X(p.location::geometry) as lng
          FROM "Place" p
          INNER JOIN "City" c ON p."cityId" = c.id
          WHERE c."countryCode" = ${countryCode}
            AND p.location IS NOT NULL
            AND p.id != ALL(${requiredPlaceIds}::int[])
            ${categorySql}
          ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
          LIMIT ${200 - requiredPlaces.length}
        `;
                return [
                    ...requiredPlaces.map(place => ({
                        id: place.id,
                        uuid: place.uuid,
                        nameCN: place.nameCN,
                        nameEN: place.nameEN || undefined,
                        category: place.category,
                        lat: place.lat,
                        lng: place.lng,
                        isRequired: true,
                    })),
                    ...otherPlaces.map(place => ({
                        id: place.id,
                        uuid: place.uuid,
                        nameCN: place.nameCN,
                        nameEN: place.nameEN || undefined,
                        category: place.category,
                        lat: place.lat,
                        lng: place.lng,
                        isRequired: false,
                    })),
                ];
            }
        }
        const rawPlaces = await this.prisma.$queryRaw `
      SELECT 
        p.id,
        p.uuid,
        p."nameCN",
        p."nameEN",
        p.category,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng
      FROM "Place" p
      INNER JOIN "City" c ON p."cityId" = c.id
      WHERE c."countryCode" = ${countryCode}
        AND p.location IS NOT NULL
        ${categorySql}
      ORDER BY p.rating DESC NULLS LAST, p."nameCN" ASC
      LIMIT 200
    `;
        return rawPlaces.map(place => ({
            id: place.id,
            uuid: place.uuid,
            nameCN: place.nameCN,
            nameEN: place.nameEN || undefined,
            category: place.category,
            lat: place.lat,
            lng: place.lng,
            isRequired: false,
        }));
    }
    extractCategoriesFromDayPlans(dayPlans) {
        const categories = new Set();
        for (const plan of dayPlans) {
            const theme = (plan.theme || '').toLowerCase();
            if (theme.includes('餐厅') || theme.includes('美食')) {
                categories.add('RESTAURANT');
            }
            if (theme.includes('景点') || theme.includes('观光')) {
                categories.add('ATTRACTION');
            }
            if (theme.includes('购物')) {
                categories.add('SHOPPING');
            }
            if (theme.includes('住宿') || theme.includes('酒店')) {
                categories.add('HOTEL');
            }
        }
        return categories.size > 0
            ? Array.from(categories)
            : ['ATTRACTION', 'RESTAURANT'];
    }
    async orchestrateWithLLM(template, dto, candidates, startDate, durationDays) {
        const prompt = this.buildOrchestrationPrompt(template, dto, candidates, startDate, durationDays);
        const slotItemSchema = {
            type: 'object',
            properties: {
                placeId: { type: 'number' },
                reason: { type: 'string' },
                required: { type: 'boolean' },
            },
            required: ['placeId', 'reason'],
        };
        const schema = {
            type: 'object',
            properties: {
                days: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            day: { type: 'number' },
                            slots: {
                                type: 'object',
                                properties: {
                                    morning: slotItemSchema,
                                    lunch: slotItemSchema,
                                    afternoon: slotItemSchema,
                                    dinner: slotItemSchema,
                                    evening: slotItemSchema,
                                },
                            },
                        },
                        required: ['day', 'slots'],
                    },
                },
            },
            required: ['days'],
        };
        try {
            this.logger.warn('LLM orchestration not fully implemented, using mock data');
            return this.mockLLMOrchestration(template, candidates, durationDays);
        }
        catch (error) {
            this.logger.error('LLM orchestration failed', error);
            throw new Error(`LLM orchestration failed: ${error.message}`);
        }
    }
    mockLLMOrchestration(template, candidates, durationDays) {
        const days = [];
        const dayPlans = this.normalizeDayPlans(template.dayPlans);
        const usedPlaceIds = new Set();
        const restaurants = candidates.filter(c => c.category === 'RESTAURANT');
        const attractions = candidates.filter(c => c.category === 'ATTRACTION');
        const hotels = candidates.filter(c => c.category === 'HOTEL');
        const getTemplatePOIs = (dayPlan) => {
            if (!(dayPlan === null || dayPlan === void 0 ? void 0 : dayPlan.pois) || dayPlan.pois.length === 0) {
                return [];
            }
            const templatePois = [];
            for (const poi of dayPlan.pois) {
                if (poi.id) {
                    const candidate = candidates.find(c => c.id === poi.id || c.uuid === poi.uuid);
                    if (candidate) {
                        templatePois.push({
                            id: candidate.id,
                            required: poi.required || false,
                            startTime: poi.startTime,
                            endTime: poi.endTime,
                            durationMinutes: poi.durationMinutes,
                        });
                    }
                    else {
                        this.logger.warn(`Template POI ${poi.id} (${poi.uuid || 'no uuid'}) not found in candidates for day ${dayPlan.day}`);
                    }
                }
            }
            return templatePois.sort((a, b) => {
                if (a.startTime && b.startTime) {
                    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
                }
                if (a.startTime)
                    return -1;
                if (b.startTime)
                    return 1;
                return 0;
            });
        };
        const matchPOIsByTheme = (theme, pool) => {
            if (!theme)
                return pool;
            const themeLower = theme.toLowerCase();
            return pool.filter(c => {
                const nameCN = (c.nameCN || '').toLowerCase();
                const nameEN = (c.nameEN || '').toLowerCase();
                return nameCN.includes(themeLower) || nameEN.includes(themeLower);
            });
        };
        const getUnusedPOI = (pool, preferred) => {
            if (preferred && preferred.length > 0) {
                for (const poi of preferred) {
                    if (!usedPlaceIds.has(poi.id)) {
                        usedPlaceIds.add(poi.id);
                        return poi.id;
                    }
                }
            }
            for (const poi of pool) {
                if (!usedPlaceIds.has(poi.id)) {
                    usedPlaceIds.add(poi.id);
                    return poi.id;
                }
            }
            return null;
        };
        for (let day = 1; day <= durationDays; day++) {
            const dayPlan = dayPlans.find(p => p.day === day) || dayPlans[day - 1];
            const theme = (dayPlan === null || dayPlan === void 0 ? void 0 : dayPlan.theme) || '';
            const templatePOIs = getTemplatePOIs(dayPlan);
            const requiredPOIs = templatePOIs.filter(p => p.required).map(p => p.id);
            const optionalPOIs = templatePOIs.filter(p => !p.required).map(p => p.id);
            const templateAttractions = attractions.filter(a => requiredPOIs.includes(a.id) || optionalPOIs.includes(a.id));
            const templateRestaurants = restaurants.filter(r => requiredPOIs.includes(r.id) || optionalPOIs.includes(r.id));
            const slots = {
                morning: null,
                lunch: null,
                afternoon: null,
                dinner: null,
                evening: null,
            };
            if (templatePOIs.length > 0) {
                const slotOrder = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'];
                const poisWithSlots = [];
                for (let i = 0; i < templatePOIs.length; i++) {
                    const templatePOI = templatePOIs[i];
                    const candidate = candidates.find(c => c.id === templatePOI.id);
                    if (!candidate) {
                        this.logger.warn(`Template POI ${templatePOI.id} not found in candidates for day ${day}`);
                        continue;
                    }
                    if (usedPlaceIds.has(templatePOI.id) && !templatePOI.required) {
                        this.logger.warn(`Template POI ${templatePOI.id} already used, skipping (not required)`);
                        continue;
                    }
                    let slotName = null;
                    if (templatePOI.startTime) {
                        try {
                            const startTimeStr = templatePOI.startTime;
                            let hour;
                            if (startTimeStr.includes('T')) {
                                const date = new Date(startTimeStr);
                                hour = date.getHours();
                            }
                            else {
                                const match = startTimeStr.match(/(\d{1,2}):(\d{2})/);
                                if (match) {
                                    hour = parseInt(match[1], 10);
                                }
                                else {
                                    slotName = slotOrder[i % slotOrder.length];
                                }
                            }
                            if (hour !== undefined) {
                                if (hour >= 6 && hour < 12) {
                                    slotName = 'morning';
                                }
                                else if (hour >= 12 && hour < 14) {
                                    slotName = 'lunch';
                                }
                                else if (hour >= 14 && hour < 18) {
                                    slotName = 'afternoon';
                                }
                                else if (hour >= 18 && hour < 20) {
                                    slotName = 'dinner';
                                }
                                else {
                                    slotName = 'evening';
                                }
                            }
                        }
                        catch (error) {
                            slotName = slotOrder[i % slotOrder.length];
                        }
                    }
                    else {
                        slotName = slotOrder[i % slotOrder.length];
                    }
                    if (slots[slotName]) {
                        const currentSlotIndex = slotOrder.indexOf(slotName);
                        for (let j = currentSlotIndex + 1; j < slotOrder.length; j++) {
                            if (!slots[slotOrder[j]]) {
                                slotName = slotOrder[j];
                                break;
                            }
                        }
                        if (slots[slotName]) {
                            for (let j = 0; j < currentSlotIndex; j++) {
                                if (!slots[slotOrder[j]]) {
                                    slotName = slotOrder[j];
                                    break;
                                }
                            }
                        }
                    }
                    if (slots[slotName]) {
                        if (templatePOI.required) {
                            this.logger.warn(`Required POI ${templatePOI.id} replacing existing slot ${slotName}`);
                        }
                        else {
                            this.logger.warn(`No available slot for POI ${templatePOI.id}, skipping`);
                            continue;
                        }
                    }
                    poisWithSlots.push({ poi: templatePOI, slotName: slotName });
                }
                for (const { poi: templatePOI, slotName } of poisWithSlots) {
                    const candidate = candidates.find(c => c.id === templatePOI.id);
                    if (!candidate)
                        continue;
                    usedPlaceIds.add(templatePOI.id);
                    slots[slotName] = {
                        placeId: templatePOI.id,
                        reason: templatePOI.required
                            ? `模板要求的必游景点：${candidate.nameCN || ''}`
                            : `模板推荐的景点：${candidate.nameCN || ''}`,
                        required: templatePOI.required,
                        startTime: templatePOI.startTime,
                        endTime: templatePOI.endTime,
                        durationMinutes: templatePOI.durationMinutes,
                    };
                }
            }
            const themeAttractions = matchPOIsByTheme(theme, attractions);
            const themeRestaurants = matchPOIsByTheme(theme, restaurants);
            if (!slots.morning && templateAttractions.length > 0) {
                const poi = getUnusedPOI(attractions, templateAttractions) || getUnusedPOI(attractions, themeAttractions);
                if (poi) {
                    const candidate = candidates.find(c => c.id === poi);
                    slots.morning = {
                        placeId: poi,
                        reason: theme ? `根据主题"${theme}"选择：${(candidate === null || candidate === void 0 ? void 0 : candidate.nameCN) || ''}` : `探索景点：${(candidate === null || candidate === void 0 ? void 0 : candidate.nameCN) || ''}`,
                        required: false,
                    };
                }
            }
            if (!slots.lunch && templateRestaurants.length > 0) {
                const poi = getUnusedPOI(restaurants, templateRestaurants) || getUnusedPOI(restaurants, themeRestaurants);
                if (poi) {
                    const candidate = candidates.find(c => c.id === poi);
                    slots.lunch = {
                        placeId: poi,
                        reason: '午餐推荐',
                        required: false,
                    };
                }
            }
            if (!slots.afternoon && templateAttractions.length > 0) {
                const poi = getUnusedPOI(attractions, templateAttractions) || getUnusedPOI(attractions, themeAttractions);
                if (poi) {
                    const candidate = candidates.find(c => c.id === poi);
                    slots.afternoon = {
                        placeId: poi,
                        reason: theme ? `继续探索"${theme}"：${(candidate === null || candidate === void 0 ? void 0 : candidate.nameCN) || ''}` : `继续探索：${(candidate === null || candidate === void 0 ? void 0 : candidate.nameCN) || ''}`,
                        required: false,
                    };
                }
            }
            if (!slots.dinner && templateRestaurants.length > 0) {
                const poi = getUnusedPOI(restaurants, templateRestaurants) || getUnusedPOI(restaurants, themeRestaurants);
                if (poi) {
                    const candidate = candidates.find(c => c.id === poi);
                    slots.dinner = {
                        placeId: poi,
                        reason: '晚餐推荐',
                        required: false,
                    };
                }
            }
            days.push({
                day,
                theme: theme,
                slots: slots,
            });
        }
        return { days };
    }
    buildOrchestrationPrompt(template, dto, candidates, startDate, durationDays) {
        return `你是一个旅行规划助手。请根据提供的路线模板和候选地点，为每一天的每个时段选择合适的 placeId。

模板信息：
- 名称：${template.nameCN || template.name}
- 天数：${template.durationDays}
- 默认节奏：${template.defaultPacePreference || 'BALANCED'}
- 每日计划：${JSON.stringify(template.dayPlans, null, 2)}

用户偏好：
- 节奏偏好：${dto.pacePreference || template.defaultPacePreference || 'BALANCED'}
- 强度：${dto.intensity || 'balanced'}
- 交通方式：${dto.transport || 'car'}

候选地点（共 ${candidates.length} 个）：
${candidates.map(c => `- ID: ${c.id}, 名称: ${c.nameCN}${c.nameEN ? ` (${c.nameEN})` : ''}, 类别: ${c.category}`).join('\n')}

请为每一天的每个时段（morning, lunch, afternoon, dinner, evening）选择一个合适的 placeId。
必须从候选地点列表中选择，不能使用列表外的 placeId。
`;
    }
    calculateSlotTime(dayDate, slot) {
        const date = new Date(dayDate);
        date.setHours(0, 0, 0, 0);
        const slotTimes = {
            morning: { start: 9 * 60, end: 12 * 60 },
            lunch: { start: 12 * 60, end: 14 * 60 },
            afternoon: { start: 14 * 60, end: 18 * 60 },
            dinner: { start: 18 * 60, end: 20 * 60 },
            evening: { start: 20 * 60, end: 22 * 60 },
        };
        const times = slotTimes[slot] || { start: 9 * 60, end: 12 * 60 };
        const startTime = new Date(date);
        startTime.setMinutes(times.start);
        const endTime = new Date(date);
        endTime.setMinutes(times.end);
        return { startTime, endTime };
    }
    mapSlotToItemType(slot, category) {
        if (slot === 'lunch' || slot === 'dinner') {
            return 'MEAL_ANCHOR';
        }
        if (category === 'RESTAURANT') {
            return 'MEAL_FLOATING';
        }
        if (category === 'HOTEL') {
            return 'REST';
        }
        return 'ACTIVITY';
    }
    calculateTravelTimeBetweenPlaces(from, to) {
        const distanceKm = this.calculateHaversineDistance(from.lat, from.lng, to.lat, to.lng);
        if (distanceKm < 1) {
            return Math.ceil(distanceKm * 12);
        }
        else if (distanceKm < 50) {
            return Math.ceil(distanceKm * 2);
        }
        else {
            return Math.ceil(distanceKm * 1);
        }
    }
    calculateHaversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) *
                Math.cos(this.toRadians(lat2)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    getActivityDuration(slot, category) {
        const slotDurations = {
            morning: 180,
            lunch: 60,
            afternoon: 240,
            dinner: 90,
            evening: 120,
        };
        let duration = slotDurations[slot] || 120;
        if (category === 'RESTAURANT') {
            duration = slot === 'lunch' ? 60 : 90;
        }
        else if (category === 'ATTRACTION') {
            if (slot === 'morning' || slot === 'afternoon') {
                duration = 180;
            }
        }
        return duration;
    }
    generateDefaultTripName(params) {
        const { generateDefaultTripName } = require('../trips/utils/trip-name.util');
        return generateDefaultTripName(params);
    }
    getDestinationName(countryCode) {
        const { getDestinationName } = require('../trips/utils/trip-name.util');
        return getDestinationName(countryCode);
    }
};
exports.RouteDirectionsService = RouteDirectionsService;
exports.RouteDirectionsService = RouteDirectionsService = RouteDirectionsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RouteDirectionsService);
//# sourceMappingURL=route-directions.service.js.map