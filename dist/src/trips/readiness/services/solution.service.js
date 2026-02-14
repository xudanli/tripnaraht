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
var SolutionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SolutionService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let SolutionService = SolutionService_1 = class SolutionService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(SolutionService_1.name);
    }
    async getSolutions(tripId, blockerId) {
        const trip = await this.prisma.trip.findUnique({
            where: { id: tripId },
        });
        if (!trip) {
            throw new common_1.NotFoundException(`行程 ID ${tripId} 不存在`);
        }
        const solutions = this.generateSolutionsForBlocker(blockerId, trip);
        const blockerMessage = this.getBlockerMessage(blockerId);
        return {
            blockerId,
            blockerMessage,
            solutions,
        };
    }
    generateSolutionsForBlocker(blockerId, trip) {
        const solutions = [];
        if (blockerId.includes('4x4') || blockerId.includes('vehicle')) {
            solutions.push({
                id: 'sol-1',
                title: '替换为铺装路面路线',
                description: '将 F 段改为使用铺装路面，绕行距离增加 15km',
                type: 'alternative',
                changes: {
                    distance: '+15km',
                    time: '+25min',
                    risk: 'decrease',
                },
                reasonCode: 'ALTERNATIVE_ROUTE',
                autoApplicable: true,
                preview: {
                    affectedItems: ['segment-f-1', 'segment-f-2'],
                },
            });
            solutions.push({
                id: 'sol-2',
                title: '手动预订 4x4 车辆',
                description: '在租车平台预订 4x4 车辆，预计费用 ¥800/天',
                type: 'manual',
                changes: {
                    cost: '+¥800',
                    risk: 'same',
                },
                autoApplicable: false,
            });
        }
        else if (blockerId.includes('visa') || blockerId.includes('签证')) {
            solutions.push({
                id: 'sol-1',
                title: '申请签证',
                description: '访问大使馆官网申请签证，准备所需材料',
                type: 'manual',
                changes: {
                    cost: '+¥500',
                    time: '+7days',
                    risk: 'same',
                },
                reasonCode: 'VISA_APPLICATION',
                evidenceLink: 'https://example.com/visa-info',
                autoApplicable: false,
            });
        }
        else {
            solutions.push({
                id: 'sol-1',
                title: '手动处理',
                description: '请根据具体情况手动处理此阻塞项',
                type: 'manual',
                autoApplicable: false,
            });
        }
        return solutions;
    }
    getBlockerMessage(blockerId) {
        if (blockerId.includes('4x4') || blockerId.includes('vehicle')) {
            return 'F - 公路段需租赁 4x4 车辆';
        }
        if (blockerId.includes('visa') || blockerId.includes('签证')) {
            return '需要办理签证';
        }
        return '阻塞项：需要处理';
    }
};
exports.SolutionService = SolutionService;
exports.SolutionService = SolutionService = SolutionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], SolutionService);
//# sourceMappingURL=solution.service.js.map