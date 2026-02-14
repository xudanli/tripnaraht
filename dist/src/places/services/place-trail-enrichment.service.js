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
exports.PlaceTrailEnrichmentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let PlaceTrailEnrichmentService = class PlaceTrailEnrichmentService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async enrichFromTrail(metadata) {
        if (metadata.trailId) {
            const trail = await this.prisma.trail.findUnique({
                where: { id: metadata.trailId },
            });
            if (trail) {
                return this.buildPhysicalMetadataFromTrail(trail);
            }
        }
        if (metadata.routeId && metadata.routeSource === 'internal') {
            const trail = await this.prisma.trail.findUnique({
                where: { uuid: metadata.routeId },
            });
            if (trail) {
                return this.buildPhysicalMetadataFromTrail(trail);
            }
        }
        return null;
    }
    buildPhysicalMetadataFromTrail(trail) {
        const patch = {};
        if (trail.estimatedDurationHours) {
            patch.estimated_duration_min = Math.round(trail.estimatedDurationHours * 60);
        }
        if (trail.difficultyLevel) {
        }
        return patch;
    }
    async enrichMultipleFromTrails(places) {
        const results = new Map();
        const trailIds = [];
        const routeIds = [];
        for (const place of places) {
            const metadata = place.metadata;
            if (metadata.trailId) {
                trailIds.push(metadata.trailId);
            }
            if (metadata.routeId && metadata.routeSource === 'internal') {
                routeIds.push(metadata.routeId);
            }
        }
        const trailsById = new Map();
        const trailsByUuid = new Map();
        if (trailIds.length > 0) {
            const trails = await this.prisma.trail.findMany({
                where: { id: { in: trailIds } },
            });
            for (const trail of trails) {
                trailsById.set(trail.id, trail);
            }
        }
        if (routeIds.length > 0) {
            const trails = await this.prisma.trail.findMany({
                where: { uuid: { in: routeIds } },
            });
            for (const trail of trails) {
                trailsByUuid.set(trail.uuid, trail);
            }
        }
        for (const place of places) {
            const metadata = place.metadata;
            let trail = null;
            if (metadata.trailId) {
                trail = trailsById.get(metadata.trailId);
            }
            else if (metadata.routeId && metadata.routeSource === 'internal') {
                trail = trailsByUuid.get(metadata.routeId);
            }
            if (trail) {
                results.set(place.id, this.buildPhysicalMetadataFromTrail(trail));
            }
        }
        return results;
    }
};
exports.PlaceTrailEnrichmentService = PlaceTrailEnrichmentService;
exports.PlaceTrailEnrichmentService = PlaceTrailEnrichmentService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PlaceTrailEnrichmentService);
//# sourceMappingURL=place-trail-enrichment.service.js.map