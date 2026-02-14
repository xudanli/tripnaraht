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
var AdminDivisionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminDivisionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let AdminDivisionService = AdminDivisionService_1 = class AdminDivisionService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(AdminDivisionService_1.name);
        this.countyToCityMap = new Map([
            ['宁海县', '宁波市'],
            ['象山县', '宁波市'],
            ['余姚市', '宁波市'],
            ['慈溪市', '宁波市'],
            ['奉化区', '宁波市'],
            ['镇海区', '宁波市'],
            ['北仑区', '宁波市'],
            ['鄞州区', '宁波市'],
            ['海曙区', '宁波市'],
            ['江北区', '宁波市'],
            ['西湖区', '杭州市'],
            ['上城区', '杭州市'],
            ['下城区', '杭州市'],
            ['江干区', '杭州市'],
            ['拱墅区', '杭州市'],
            ['滨江区', '杭州市'],
            ['萧山区', '杭州市'],
            ['余杭区', '杭州市'],
            ['临安区', '杭州市'],
            ['富阳区', '杭州市'],
        ]);
        this.poiAliasToCityMap = new Map([
            ['西湖', '杭州市'],
            ['西湖景区', '杭州市'],
            ['西湖风景名胜区', '杭州市'],
            ['十里红妆', '宁波市'],
            ['十里红妆博物馆', '宁波市'],
            ['十里红妆文化园', '宁波市'],
            ['十里红妆景区', '宁波市'],
            ['故宫', '北京市'],
            ['故宫博物院', '北京市'],
            ['天安门', '北京市'],
            ['天安门广场', '北京市'],
            ['长城', '北京市'],
            ['颐和园', '北京市'],
            ['天坛', '北京市'],
            ['圆明园', '北京市'],
            ['北海', '北京市'],
            ['景山', '北京市'],
            ['景山公园', '北京市'],
        ]);
    }
    async mapToCity(divisionName) {
        if (this.countyToCityMap.has(divisionName)) {
            return this.countyToCityMap.get(divisionName);
        }
        try {
            const city = await this.prisma.city.findFirst({
                where: {
                    OR: [
                        { nameCN: divisionName },
                        { name: divisionName },
                        { nameEN: divisionName },
                    ],
                },
                select: {
                    id: true,
                    name: true,
                    nameCN: true,
                    adcode: true,
                    metadata: true,
                },
            });
            if (city) {
                if (city.adcode) {
                    const prefectureCode = city.adcode.substring(0, 4) + '00';
                    const prefectureCity = await this.prisma.city.findFirst({
                        where: {
                            adcode: prefectureCode,
                        },
                        select: {
                            nameCN: true,
                            name: true,
                        },
                    });
                    if (prefectureCity) {
                        return prefectureCity.nameCN || prefectureCity.name;
                    }
                }
                const metadata = city.metadata;
                if (metadata === null || metadata === void 0 ? void 0 : metadata.parentCity) {
                    return metadata.parentCity;
                }
            }
        }
        catch (error) {
            this.logger.warn(`查询城市映射失败: ${error}`);
        }
        return null;
    }
    mapPoiAliasToCity(poiName) {
        if (this.poiAliasToCityMap.has(poiName)) {
            return this.poiAliasToCityMap.get(poiName);
        }
        for (const [alias, city] of this.poiAliasToCityMap.entries()) {
            if (poiName.includes(alias) || alias.includes(poiName)) {
                return city;
            }
        }
        return null;
    }
    async normalizeCityName(cityName) {
        const poiCity = this.mapPoiAliasToCity(cityName);
        if (poiCity) {
            return poiCity;
        }
        const mappedCity = await this.mapToCity(cityName);
        if (mappedCity) {
            return mappedCity;
        }
        return cityName;
    }
    async normalizeCityNames(cityNames) {
        const normalized = await Promise.all(cityNames.map(name => this.normalizeCityName(name)));
        return Array.from(new Set(normalized));
    }
};
exports.AdminDivisionService = AdminDivisionService;
exports.AdminDivisionService = AdminDivisionService = AdminDivisionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminDivisionService);
//# sourceMappingURL=admin-division.service.js.map