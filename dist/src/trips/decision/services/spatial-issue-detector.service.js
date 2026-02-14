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
var SpatialIssueDetectorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpatialIssueDetectorService = void 0;
const common_1 = require("@nestjs/common");
let SpatialIssueDetectorService = SpatialIssueDetectorService_1 = class SpatialIssueDetectorService {
    constructor(roadRepo, poiRepo, ferryRepo, hazardService) {
        this.roadRepo = roadRepo;
        this.poiRepo = poiRepo;
        this.ferryRepo = ferryRepo;
        this.hazardService = hazardService;
        this.logger = new common_1.Logger(SpatialIssueDetectorService_1.name);
    }
    async detect(world, plan) {
        this.logger.debug(`开始检测空间问题: ${plan.tripId}`);
        const issues = [];
        issues.push(...(await this.detectEntryIssues(world, plan)), ...(await this.detectPoiIssues(world, plan)), ...(await this.detectSegmentIssues(world, plan)), ...(await this.detectFerryIssues(world, plan)), ...(await this.detectHazardIssues(world, plan)));
        this.logger.debug(`检测到 ${issues.length} 个空间问题`);
        return issues;
    }
    async detectEntryIssues(world, plan) {
        var _a, _b;
        const issues = [];
        if (!this.roadRepo) {
            return issues;
        }
        const firstDaySegments = plan.segments.filter(s => s.dayIndex === 1);
        if (!firstDaySegments.length) {
            return issues;
        }
        const entrySegment = firstDaySegments[0];
        const entryRoad = await this.roadRepo.findBySegmentId(entrySegment.segmentId);
        if (!entryRoad) {
            return issues;
        }
        if (entryRoad.status === 'CLOSED') {
            issues.push({
                issueId: `ENTRY_CLOSED_${entryRoad.id}_${Date.now()}`,
                type: 'ENTRY_UNREACHABLE',
                severity: 'HARD',
                segmentId: entrySegment.segmentId,
                reason: '入口道路处于封闭状态',
                originalLocation: (_a = entrySegment.metadata) === null || _a === void 0 ? void 0 : _a.location,
                metadata: { roadId: entryRoad.id, status: entryRoad.status },
            });
        }
        if (entryRoad.status === 'SEASONAL') {
            const m = world.physical.month;
            const openFrom = entryRoad.seasonOpenFrom;
            const openTo = entryRoad.seasonOpenTo;
            if (openFrom !== undefined && openTo !== undefined) {
                const isOpen = openFrom <= openTo
                    ? m >= openFrom && m <= openTo
                    : m >= openFrom || m <= openTo;
                if (!isOpen) {
                    issues.push({
                        issueId: `ENTRY_OUT_OF_SEASON_${entryRoad.id}_${Date.now()}`,
                        type: 'ENTRY_UNREACHABLE',
                        severity: 'HARD',
                        segmentId: entrySegment.segmentId,
                        reason: `入口道路为季节性道路，${m} 月不开放（开放时间：${openFrom}-${openTo} 月）`,
                        originalLocation: (_b = entrySegment.metadata) === null || _b === void 0 ? void 0 : _b.location,
                        metadata: {
                            roadId: entryRoad.id,
                            status: entryRoad.status,
                            openFrom,
                            openTo,
                            currentMonth: m,
                        },
                    });
                }
            }
        }
        return issues;
    }
    async detectPoiIssues(world, plan) {
        var _a, _b, _c;
        const issues = [];
        if (!this.poiRepo) {
            return issues;
        }
        const poiIds = plan.segments
            .map(s => { var _a; return (_a = s.metadata) === null || _a === void 0 ? void 0 : _a.poiId; })
            .filter((id) => !!id && typeof id === 'string');
        if (!poiIds.length) {
            return issues;
        }
        const pois = await this.poiRepo.findManyByIds(poiIds);
        for (const poi of pois) {
            const segment = plan.segments.find(s => { var _a; return ((_a = s.metadata) === null || _a === void 0 ? void 0 : _a.poiId) === poi.id; });
            if (poi.status === 'CLOSED') {
                issues.push({
                    issueId: `POI_CLOSED_${poi.id}_${Date.now()}`,
                    type: 'POI_UNAVAILABLE',
                    severity: 'HARD',
                    segmentId: segment === null || segment === void 0 ? void 0 : segment.segmentId,
                    poiId: poi.id,
                    reason: `该点当前关闭：${(_a = poi.closingReason) !== null && _a !== void 0 ? _a : '未知原因'}`,
                    originalLocation: (_b = segment === null || segment === void 0 ? void 0 : segment.metadata) === null || _b === void 0 ? void 0 : _b.location,
                    metadata: {
                        closingReason: poi.closingReason,
                        status: poi.status,
                    },
                });
            }
            else if (poi.validTo && poi.validTo < new Date()) {
                issues.push({
                    issueId: `POI_EXPIRED_${poi.id}_${Date.now()}`,
                    type: 'POI_UNAVAILABLE',
                    severity: 'SOFT',
                    segmentId: segment === null || segment === void 0 ? void 0 : segment.segmentId,
                    poiId: poi.id,
                    reason: '该点有效期已过，状态可能不可靠',
                    originalLocation: (_c = segment === null || segment === void 0 ? void 0 : segment.metadata) === null || _c === void 0 ? void 0 : _c.location,
                    metadata: {
                        validTo: poi.validTo.toISOString(),
                        status: poi.status,
                    },
                });
            }
        }
        return issues;
    }
    async detectSegmentIssues(world, plan) {
        var _a, _b;
        const issues = [];
        if (!this.roadRepo) {
            return issues;
        }
        const nonEntrySegments = plan.segments.filter(s => s.dayIndex > 1);
        for (const seg of nonEntrySegments) {
            const road = await this.roadRepo.findBySegmentId(seg.segmentId);
            if (!road) {
                continue;
            }
            if (road.status === 'CLOSED') {
                issues.push({
                    issueId: `SEGMENT_CLOSED_${seg.segmentId}_${Date.now()}`,
                    type: 'SEGMENT_BLOCKED',
                    severity: 'HARD',
                    segmentId: seg.segmentId,
                    reason: '行程中的某段道路处于封闭状态',
                    originalLocation: (_a = seg.metadata) === null || _a === void 0 ? void 0 : _a.location,
                    metadata: {
                        roadId: road.id,
                        dayIndex: seg.dayIndex,
                        status: road.status,
                    },
                });
            }
            else if (road.status === 'RESTRICTED' && road.hazardTag !== 'NONE') {
                issues.push({
                    issueId: `SEGMENT_RESTRICTED_${seg.segmentId}_${Date.now()}`,
                    type: 'SEGMENT_BLOCKED',
                    severity: 'SOFT',
                    segmentId: seg.segmentId,
                    reason: `该路段受限：${road.hazardTag}`,
                    originalLocation: (_b = seg.metadata) === null || _b === void 0 ? void 0 : _b.location,
                    metadata: {
                        roadId: road.id,
                        dayIndex: seg.dayIndex,
                        status: road.status,
                        hazardTag: road.hazardTag,
                    },
                });
            }
        }
        return issues;
    }
    async detectFerryIssues(world, plan) {
        var _a, _b, _c;
        const issues = [];
        if (!this.ferryRepo) {
            return issues;
        }
        const ferrySegs = plan.segments.filter(s => { var _a, _b; return ((_a = s.metadata) === null || _a === void 0 ? void 0 : _a.mode) === 'FERRY' || ((_b = s.metadata) === null || _b === void 0 ? void 0 : _b.ferryId); });
        for (const seg of ferrySegs) {
            const ferryId = (_a = seg.metadata) === null || _a === void 0 ? void 0 : _a.ferryId;
            if (!ferryId || typeof ferryId !== 'string') {
                continue;
            }
            const ferry = await this.ferryRepo.findById(ferryId);
            if (!ferry) {
                continue;
            }
            if (ferry.status === 'CANCELLED') {
                issues.push({
                    issueId: `FERRY_CANCELLED_${ferry.id}_${Date.now()}`,
                    type: 'FERRY_CANCELLED',
                    severity: 'HARD',
                    segmentId: seg.segmentId,
                    reason: '该渡轮已停运或当日取消',
                    originalLocation: (_b = seg.metadata) === null || _b === void 0 ? void 0 : _b.location,
                    metadata: {
                        ferryId: ferry.id,
                        dayIndex: seg.dayIndex,
                        status: ferry.status,
                    },
                });
            }
            else if (ferry.status === 'SEASONAL') {
                const m = world.physical.month;
                const openFrom = ferry.seasonOpenFrom;
                const openTo = ferry.seasonOpenTo;
                if (openFrom !== undefined && openTo !== undefined) {
                    const isOpen = openFrom <= openTo
                        ? m >= openFrom && m <= openTo
                        : m >= openFrom || m <= openTo;
                    if (!isOpen) {
                        issues.push({
                            issueId: `FERRY_OUT_OF_SEASON_${ferry.id}_${Date.now()}`,
                            type: 'FERRY_CANCELLED',
                            severity: 'HARD',
                            segmentId: seg.segmentId,
                            reason: `该渡轮为季节性运营，${m} 月不开放（开放时间：${openFrom}-${openTo} 月）`,
                            originalLocation: (_c = seg.metadata) === null || _c === void 0 ? void 0 : _c.location,
                            metadata: {
                                ferryId: ferry.id,
                                dayIndex: seg.dayIndex,
                                status: ferry.status,
                                openFrom,
                                openTo,
                                currentMonth: m,
                            },
                        });
                    }
                }
            }
        }
        return issues;
    }
    async detectHazardIssues(world, plan) {
        var _a, _b;
        const issues = [];
        if (!this.hazardService) {
            return issues;
        }
        for (const seg of plan.segments) {
            const hazard = await this.hazardService.checkSegment(seg.segmentId);
            if (!hazard) {
                continue;
            }
            if (hazard.level === 'HIGH') {
                issues.push({
                    issueId: `HAZARD_HIGH_${seg.segmentId}_${Date.now()}`,
                    type: 'HAZARD_ZONE',
                    severity: 'HARD',
                    segmentId: seg.segmentId,
                    reason: `该路段穿越高风险区域：${hazard.hazardType}${hazard.description ? ` (${hazard.description})` : ''}`,
                    originalLocation: (_a = seg.metadata) === null || _a === void 0 ? void 0 : _a.location,
                    metadata: {
                        hazardType: hazard.hazardType,
                        level: hazard.level,
                        description: hazard.description,
                        dayIndex: seg.dayIndex,
                    },
                });
            }
            else if (hazard.level === 'MEDIUM') {
                issues.push({
                    issueId: `HAZARD_MEDIUM_${seg.segmentId}_${Date.now()}`,
                    type: 'HAZARD_ZONE',
                    severity: 'SOFT',
                    segmentId: seg.segmentId,
                    reason: `该路段穿越中等风险区域：${hazard.hazardType}${hazard.description ? ` (${hazard.description})` : ''}`,
                    originalLocation: (_b = seg.metadata) === null || _b === void 0 ? void 0 : _b.location,
                    metadata: {
                        hazardType: hazard.hazardType,
                        level: hazard.level,
                        description: hazard.description,
                        dayIndex: seg.dayIndex,
                    },
                });
            }
        }
        return issues;
    }
};
exports.SpatialIssueDetectorService = SpatialIssueDetectorService;
exports.SpatialIssueDetectorService = SpatialIssueDetectorService = SpatialIssueDetectorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object, Object, Object, Object])
], SpatialIssueDetectorService);
//# sourceMappingURL=spatial-issue-detector.service.js.map