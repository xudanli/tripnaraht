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
var PackStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackStorageService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../../../prisma/prisma.service");
const client_1 = require("@prisma/client");
const fs_1 = require("fs");
const path_1 = require("path");
let PackStorageService = PackStorageService_1 = class PackStorageService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PackStorageService_1.name);
        this.packsDirectory = (0, path_1.join)(__dirname, '../data/packs');
    }
    async loadGlobalPackingTemplate() {
        try {
            const template = await this.prisma.$queryRawUnsafe(`SELECT template_data, version, last_updated 
         FROM packing_checklist_templates 
         WHERE is_active = true 
         ORDER BY last_updated DESC 
         LIMIT 1`);
            if (template.length === 0) {
                this.logger.warn('No active packing template found in database');
                return null;
            }
            return {
                ...template[0].template_data,
                metadata: {
                    ...template[0].template_data.metadata,
                    version: template[0].version,
                    lastUpdated: template[0].last_updated.toISOString(),
                },
            };
        }
        catch (error) {
            this.logger.warn(`Failed to load global packing template: ${error.message}`);
            return null;
        }
    }
    async loadGlobalPackingGuide() {
        try {
            const guide = await this.prisma.$queryRawUnsafe(`SELECT guide_data, version, last_updated 
         FROM packing_guides 
         WHERE is_active = true 
         ORDER BY last_updated DESC 
         LIMIT 1`);
            if (guide.length === 0) {
                this.logger.warn('No active packing guide found in database');
                return null;
            }
            return {
                ...guide[0].guide_data,
                metadata: {
                    ...guide[0].guide_data.metadata,
                    version: guide[0].version,
                    lastUpdated: guide[0].last_updated.toISOString(),
                },
            };
        }
        catch (error) {
            this.logger.warn(`Failed to load global packing guide: ${error.message}`);
            return null;
        }
    }
    async loadPack(packId, includePackingData = true) {
        var _a, _b, _c, _d;
        try {
            const record = await this.prisma.readinessPack.findUnique({
                where: { packId, isActive: true },
            });
            if (!record) {
                this.logger.debug(`Pack not found in database: ${packId}`);
                return null;
            }
            const pack = record.packData;
            if (pack.packing) {
                return pack;
            }
            if (includePackingData) {
                const [template, guide] = await Promise.all([
                    this.loadGlobalPackingTemplate(),
                    this.loadGlobalPackingGuide(),
                ]);
                if (template || guide) {
                    pack.packing = {
                        ...(template && {
                            packingTemplate: {
                                version: ((_a = template.metadata) === null || _a === void 0 ? void 0 : _a.version) || '1.0.0',
                                lastUpdated: ((_b = template.metadata) === null || _b === void 0 ? void 0 : _b.lastUpdated) || new Date().toISOString(),
                                data: template,
                            },
                        }),
                        ...(guide && {
                            packingGuide: {
                                version: ((_c = guide.metadata) === null || _c === void 0 ? void 0 : _c.version) || '1.0.0',
                                lastUpdated: ((_d = guide.metadata) === null || _d === void 0 ? void 0 : _d.lastUpdated) || new Date().toISOString(),
                                data: guide,
                            },
                        }),
                    };
                }
            }
            return pack;
        }
        catch (error) {
            this.logger.error(`Failed to load pack ${packId}: ${error.message}`);
            return null;
        }
    }
    async loadAllPacks() {
        try {
            const records = await this.prisma.readinessPack.findMany({
                where: { isActive: true },
                orderBy: { updatedAt: 'desc' },
            });
            const packs = records
                .map((record) => record.packData)
                .filter((pack) => pack !== null);
            this.logger.log(`Loaded ${packs.length} packs from database`);
            return packs;
        }
        catch (error) {
            this.logger.error(`Failed to load packs: ${error.message}`);
            return [];
        }
    }
    async findPackByDestination(destinationId) {
        try {
            const record = await this.prisma.readinessPack.findFirst({
                where: {
                    destinationId,
                    isActive: true,
                },
                orderBy: { version: 'desc' },
            });
            if (!record) {
                return null;
            }
            return record.packData;
        }
        catch (error) {
            this.logger.error(`Failed to find pack by destination ${destinationId}: ${error.message}`);
            return null;
        }
    }
    async findPacksByCountry(countryCode) {
        try {
            const records = await this.prisma.readinessPack.findMany({
                where: {
                    countryCode: countryCode.toUpperCase(),
                    isActive: true,
                },
                orderBy: { updatedAt: 'desc' },
            });
            return records.map(record => record.packData);
        }
        catch (error) {
            this.logger.error(`Failed to find packs by country ${countryCode}: ${error.message}`);
            return [];
        }
    }
    async findPackByCity(cityName, countryCode) {
        try {
            let whereClause = client_1.Prisma.sql `WHERE "isActive" = true AND LOWER("city") = LOWER(${cityName})`;
            if (countryCode) {
                whereClause = client_1.Prisma.sql `${whereClause} AND "countryCode" = ${countryCode.toUpperCase()}`;
            }
            const records = await this.prisma.$queryRaw `
        SELECT *
        FROM "ReadinessPack"
        ${whereClause}
        ORDER BY version DESC
        LIMIT 1
      `;
            if (records.length === 0) {
                return null;
            }
            return records[0].packData;
        }
        catch (error) {
            this.logger.error(`Failed to find pack by city ${cityName}: ${error.message}`);
            return null;
        }
    }
    async findPacksByRegion(regionName) {
        try {
            const records = await this.prisma.$queryRaw `
        SELECT *
        FROM "ReadinessPack"
        WHERE "isActive" = true 
          AND LOWER("region") = LOWER(${regionName})
        ORDER BY "updatedAt" DESC
      `;
            return records.map(record => record.packData);
        }
        catch (error) {
            this.logger.error(`Failed to find packs by region ${regionName}: ${error.message}`);
            return [];
        }
    }
    async findNearestPack(lat, lng, maxDistanceKm = 50) {
        try {
            const records = await this.prisma.$queryRaw `
        SELECT 
          *,
          (
            6371 * acos(
              cos(radians(${lat})) * 
              cos(radians("latitude")) * 
              cos(radians("longitude") - radians(${lng})) + 
              sin(radians(${lat})) * 
              sin(radians("latitude"))
            )
          ) AS distance_km
        FROM "ReadinessPack"
        WHERE 
          "isActive" = true
          AND "latitude" IS NOT NULL
          AND "longitude" IS NOT NULL
        ORDER BY distance_km ASC
        LIMIT 1
      `;
            if (records.length === 0) {
                return null;
            }
            const record = records[0];
            const distanceKm = parseFloat(record.distance_km);
            if (distanceKm > maxDistanceKm) {
                this.logger.debug(`Nearest pack is ${distanceKm.toFixed(2)}km away, exceeds threshold ${maxDistanceKm}km`);
                return null;
            }
            this.logger.debug(`Found nearest pack ${record.packId} at ${distanceKm.toFixed(2)}km away`);
            return record.packData;
        }
        catch (error) {
            this.logger.warn(`Failed to find nearest pack using SQL: ${error.message}, falling back to simple query`);
            try {
                const allRecords = await this.prisma.readinessPack.findMany({
                    where: {
                        isActive: true,
                        latitude: { not: null },
                        longitude: { not: null },
                    },
                });
                let nearestPack = null;
                let minDistance = Infinity;
                for (const record of allRecords) {
                    if (record.latitude === null || record.longitude === null)
                        continue;
                    const distance = this.calculateHaversineDistance(lat, lng, record.latitude, record.longitude);
                    if (distance < minDistance && distance <= maxDistanceKm) {
                        minDistance = distance;
                        nearestPack = record.packData;
                    }
                }
                return nearestPack;
            }
            catch (fallbackError) {
                this.logger.error(`Failed to find nearest pack: ${fallbackError.message}`);
                return null;
            }
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
    extractLocalizedFields(value) {
        if (!value) {
            return { default: undefined, en: undefined, cn: undefined };
        }
        if (typeof value === 'string') {
            return { default: value, en: value, cn: undefined };
        }
        return {
            default: value.en,
            en: value.en,
            cn: value.zh,
        };
    }
    async savePack(pack) {
        try {
            const existing = await this.prisma.readinessPack.findUnique({
                where: { packId: pack.packId },
            });
            const displayNameFields = this.extractLocalizedFields(pack.displayName);
            const regionFields = this.extractLocalizedFields(pack.geo.region);
            const cityFields = this.extractLocalizedFields(pack.geo.city);
            const packData = {
                packId: pack.packId,
                destinationId: pack.destinationId,
                displayName: displayNameFields.default || '',
                displayNameEN: displayNameFields.en,
                displayNameCN: displayNameFields.cn,
                version: pack.version,
                lastReviewedAt: new Date(pack.lastReviewedAt),
                countryCode: pack.geo.countryCode,
                region: regionFields.default,
                regionEN: regionFields.en,
                regionCN: regionFields.cn,
                city: cityFields.default,
                cityEN: cityFields.en,
                cityCN: cityFields.cn,
                latitude: pack.geo.lat,
                longitude: pack.geo.lng,
                packData: pack,
                isActive: true,
            };
            if (existing) {
                await this.prisma.readinessPack.update({
                    where: { packId: pack.packId },
                    data: packData,
                });
                this.logger.log(`Updated pack: ${pack.packId}`);
            }
            else {
                await this.prisma.readinessPack.create({
                    data: {
                        ...packData,
                        id: packData.packId || (0, crypto_1.randomUUID)(),
                        updatedAt: new Date(),
                    },
                });
                this.logger.log(`Created pack: ${pack.packId}`);
            }
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to save pack ${pack.packId}: ${error.message}`);
            return false;
        }
    }
    async importPackFromFile(filePath) {
        try {
            if (!(0, fs_1.existsSync)(filePath)) {
                this.logger.error(`File not found: ${filePath}`);
                return false;
            }
            const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const pack = JSON.parse(content);
            if (!pack.packId || !pack.destinationId || !pack.rules) {
                throw new Error('Invalid pack format: missing required fields');
            }
            return await this.savePack(pack);
        }
        catch (error) {
            this.logger.error(`Failed to import pack from file ${filePath}: ${error.message}`);
            return false;
        }
    }
    async importPacksFromDirectory(directory) {
        const dir = directory || this.packsDirectory;
        let success = 0;
        let failed = 0;
        try {
            if (!(0, fs_1.existsSync)(dir)) {
                this.logger.warn(`Directory does not exist: ${dir}`);
                return { success: 0, failed: 0 };
            }
            const files = (0, fs_1.readdirSync)(dir);
            for (const file of files) {
                if (!file.endsWith('.json')) {
                    continue;
                }
                const filePath = (0, path_1.join)(dir, file);
                const result = await this.importPackFromFile(filePath);
                if (result) {
                    success++;
                }
                else {
                    failed++;
                }
            }
            this.logger.log(`Imported ${success} packs, ${failed} failed from ${dir}`);
        }
        catch (error) {
            this.logger.error(`Failed to import packs from directory: ${error.message}`);
        }
        return { success, failed };
    }
    async deactivatePack(packId) {
        try {
            await this.prisma.readinessPack.update({
                where: { packId },
                data: { isActive: false },
            });
            this.logger.log(`Deactivated pack: ${packId}`);
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to deactivate pack ${packId}: ${error.message}`);
            return false;
        }
    }
    validatePack(pack) {
        const errors = [];
        if (!pack.packId)
            errors.push('packId is required');
        if (!pack.destinationId)
            errors.push('destinationId is required');
        if (!pack.displayName)
            errors.push('displayName is required');
        if (!pack.version)
            errors.push('version is required');
        if (!pack.lastReviewedAt)
            errors.push('lastReviewedAt is required');
        if (!pack.geo)
            errors.push('geo is required');
        if (!pack.geo.countryCode)
            errors.push('geo.countryCode is required');
        if (!pack.rules || !Array.isArray(pack.rules)) {
            errors.push('rules must be a non-empty array');
        }
        if (!pack.checklists || !Array.isArray(pack.checklists)) {
            errors.push('checklists must be a non-empty array');
        }
        if (pack.version && !/^\d+\.\d+\.\d+$/.test(pack.version)) {
            errors.push('version must follow semantic versioning (e.g., 1.0.0)');
        }
        if (pack.rules) {
            pack.rules.forEach((rule, index) => {
                if (!rule.id)
                    errors.push(`rules[${index}].id is required`);
                if (!rule.category)
                    errors.push(`rules[${index}].category is required`);
                if (!rule.when)
                    errors.push(`rules[${index}].when is required`);
                if (!rule.then)
                    errors.push(`rules[${index}].then is required`);
                if (!rule.then.level)
                    errors.push(`rules[${index}].then.level is required`);
                if (!rule.then.message)
                    errors.push(`rules[${index}].then.message is required`);
            });
        }
        return {
            valid: errors.length === 0,
            errors,
        };
    }
};
exports.PackStorageService = PackStorageService;
exports.PackStorageService = PackStorageService = PackStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PackStorageService);
//# sourceMappingURL=pack-storage.service.js.map