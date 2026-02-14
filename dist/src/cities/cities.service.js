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
var CitiesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CitiesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let CitiesService = CitiesService_1 = class CitiesService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(CitiesService_1.name);
    }
    async findAll(query) {
        const maxLimit = 1000;
        let { countryCode, q, limit = 50, offset = 0 } = query;
        if (limit > maxLimit) {
            limit = maxLimit;
            this.logger.warn(`[CitiesService.findAll] limit超过最大值${maxLimit}，已自动调整为${maxLimit}`);
        }
        try {
            this.logger.debug(`[CitiesService.findAll] 收到查询参数: ${JSON.stringify({ countryCode, q, limit, offset })}`);
            const normalizedCountryCode = countryCode ? countryCode.toUpperCase().trim() : undefined;
            if (normalizedCountryCode) {
                this.logger.debug(`[CitiesService.findAll] 规范化后的国家代码: ${normalizedCountryCode}`);
            }
            else {
                this.logger.debug(`[CitiesService.findAll] 未提供国家代码，将返回所有城市`);
            }
            if (q) {
                const searchTerm = q.trim();
                const searchPattern = `%${searchTerm}%`;
                const whereCondition = {
                    OR: [
                        { nameCN: { contains: searchTerm, mode: 'insensitive' } },
                        { nameEN: { contains: searchTerm, mode: 'insensitive' } },
                        { name: { contains: searchTerm, mode: 'insensitive' } },
                    ],
                };
                if (normalizedCountryCode) {
                    whereCondition.countryCode = normalizedCountryCode;
                }
                const total = await this.prisma.city.count({
                    where: whereCondition,
                });
                const cities = await this.prisma.city.findMany({
                    where: whereCondition,
                    take: limit,
                    skip: offset,
                    orderBy: [
                        { countryCode: 'asc' },
                        { name: 'asc' },
                    ],
                });
                const cityDtos = cities.map(city => this.mapToDto(city));
                const hasMore = offset + cityDtos.length < total;
                this.logger.debug(`搜索城市结果: 找到 ${cityDtos.length} 个城市 (searchTerm=${searchTerm}, countryCode=${normalizedCountryCode || 'all'}, total=${total}, hasMore=${hasMore})`);
                return {
                    cities: cityDtos,
                    total,
                    hasMore,
                    limit,
                    offset,
                };
            }
            if (normalizedCountryCode) {
                this.logger.debug(`[CitiesService.findAll] 使用 Prisma 查询（带国家代码过滤）: countryCode=${normalizedCountryCode}, limit=${limit}, offset=${offset}`);
                const whereCondition = {
                    countryCode: normalizedCountryCode,
                };
                const total = await this.prisma.city.count({
                    where: whereCondition,
                });
                const cities = await this.prisma.city.findMany({
                    where: whereCondition,
                    take: limit,
                    skip: offset,
                    orderBy: [
                        { countryCode: 'asc' },
                        { name: 'asc' },
                    ],
                });
                const cityDtos = cities.map(city => this.mapToDto(city));
                const hasMore = offset + cityDtos.length < total;
                this.logger.debug(`[CitiesService.findAll] ✅ Prisma 查询结果: ${cityDtos.length} 个城市 (countryCode=${normalizedCountryCode}, total=${total}, hasMore=${hasMore})`);
                return {
                    cities: cityDtos,
                    total,
                    hasMore,
                    limit,
                    offset,
                };
            }
            const where = {};
            this.logger.debug(`[CitiesService.findAll] 使用 Prisma 查询（无国家代码过滤）: where=${JSON.stringify(where)}`);
            const total = await this.prisma.city.count({ where });
            const cities = await this.prisma.city.findMany({
                where,
                take: limit,
                skip: offset,
                orderBy: [
                    { countryCode: 'asc' },
                    { name: 'asc' },
                ],
            });
            const cityDtos = cities.map(city => this.mapToDto(city));
            const hasMore = offset + cityDtos.length < total;
            this.logger.debug(`[CitiesService.findAll] Prisma findMany 查询结果: ${cityDtos.length} 个城市 (total=${total}, hasMore=${hasMore})`);
            return {
                cities: cityDtos,
                total,
                hasMore,
                limit,
                offset,
            };
        }
        catch (error) {
            this.logger.error(`Failed to find cities: ${error.message}`, error.stack);
            throw error;
        }
    }
    async findOne(id) {
        try {
            const city = await this.prisma.city.findUnique({
                where: { id },
            });
            if (!city) {
                throw new common_1.NotFoundException(`城市 ID ${id} 不存在`);
            }
            return this.mapToDto(city);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                throw error;
            }
            this.logger.error(`Failed to find city ${id}: ${error.message}`, error.stack);
            throw error;
        }
    }
    mapToDto(city) {
        let lat;
        let lng;
        if (city.location) {
            if (typeof city.location === 'string') {
                const match = city.location.match(/POINT\(([^)]+)\)/);
                if (match) {
                    const [lngStr, latStr] = match[1].split(/\s+/);
                    lng = parseFloat(lngStr);
                    lat = parseFloat(latStr);
                }
            }
            else if (typeof city.location === 'object') {
                if (city.location.coordinates && Array.isArray(city.location.coordinates)) {
                    lng = city.location.coordinates[0];
                    lat = city.location.coordinates[1];
                }
                if (city.location.lat && city.location.lng) {
                    lat = city.location.lat;
                    lng = city.location.lng;
                }
            }
        }
        return {
            id: city.id,
            name: city.name,
            countryCode: city.countryCode,
            nameCN: city.nameCN || undefined,
            nameEN: city.nameEN || undefined,
            adcode: city.adcode || undefined,
            timezone: city.timezone || undefined,
            lat,
            lng,
            metadata: city.metadata || undefined,
        };
    }
    async countByCountry(countryCode) {
        try {
            return await this.prisma.city.count({
                where: {
                    countryCode: countryCode.toUpperCase(),
                },
            });
        }
        catch (error) {
            this.logger.error(`Failed to count cities by country ${countryCode}: ${error.message}`);
            return 0;
        }
    }
};
exports.CitiesService = CitiesService;
exports.CitiesService = CitiesService = CitiesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CitiesService);
//# sourceMappingURL=cities.service.js.map