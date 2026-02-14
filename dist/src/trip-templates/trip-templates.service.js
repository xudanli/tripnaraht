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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripTemplatesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const trips_service_1 = require("../trips/trips.service");
let TripTemplatesService = class TripTemplatesService {
    constructor(prisma, tripsService) {
        this.prisma = prisma;
        this.tripsService = tripsService;
    }
    async findAll(query) {
        const where = {};
        if (query.theme) {
            where.theme = query.theme;
        }
        if (query.destination) {
            where.destination = query.destination;
        }
        if (query.isPublic !== undefined) {
            where.isPublic = query.isPublic;
        }
        else {
            where.isPublic = true;
        }
        const templates = await this.prisma.tripTemplate.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
        return templates.map(t => ({
            id: t.id,
            name: t.name,
            nameCN: t.nameCN || undefined,
            description: t.description || undefined,
            theme: t.theme,
            destination: t.destination || undefined,
            config: t.config,
            isPublic: t.isPublic,
            createdAt: t.createdAt,
            updatedAt: t.updatedAt,
        }));
    }
    async findOne(id) {
        const template = await this.prisma.tripTemplate.findUnique({
            where: { id },
        });
        if (!template) {
            throw new common_1.NotFoundException(`行程模板不存在: ${id}`);
        }
        return {
            id: template.id,
            name: template.name,
            nameCN: template.nameCN || undefined,
            description: template.description || undefined,
            theme: template.theme,
            destination: template.destination || undefined,
            config: template.config,
            isPublic: template.isPublic,
            createdAt: template.createdAt,
            updatedAt: template.updatedAt,
        };
    }
    async createTripFromTemplate(dto, userId) {
        var _a, _b, _c;
        const template = await this.findOne(dto.templateId);
        const config = template.config;
        const budgetConfig = ((_a = dto.overrideConfig) === null || _a === void 0 ? void 0 : _a.budgetConfig) || config.budgetConfig || {};
        const pacingConfig = ((_b = dto.overrideConfig) === null || _b === void 0 ? void 0 : _b.pacingConfig) || config.pacingConfig || {};
        if (dto.totalBudget) {
            budgetConfig.totalBudget = dto.totalBudget;
        }
        const createTripDto = {
            destination: dto.destination,
            startDate: dto.startDate,
            endDate: dto.endDate,
            totalBudget: dto.totalBudget || ((_c = config.budgetConfig) === null || _c === void 0 ? void 0 : _c.totalBudget) || 20000,
            travelers: config.travelers || [],
        };
        return await this.tripsService.create(createTripDto, userId);
    }
};
exports.TripTemplatesService = TripTemplatesService;
exports.TripTemplatesService = TripTemplatesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        trips_service_1.TripsService])
], TripTemplatesService);
//# sourceMappingURL=trip-templates.service.js.map