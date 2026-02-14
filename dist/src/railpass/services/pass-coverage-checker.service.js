"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PassCoverageCheckerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PassCoverageCheckerService = void 0;
const common_1 = require("@nestjs/common");
const COVERED_OPERATORS = new Set([
    'SNCF',
    'DB',
    'ÖBB',
    'SBB',
    'Trenitalia',
    'Renfe',
    'NS',
    'SNCB',
    'CP',
    'Eurostar',
    'Thalys',
    'TGV',
    'ICE',
]);
const USUALLY_NOT_COVERED = new Set([
    'METRO',
    'TRAM',
    'CITY_BUS',
    'PRIVATE_RAIL',
]);
let PassCoverageCheckerService = PassCoverageCheckerService_1 = class PassCoverageCheckerService {
    constructor() {
        this.logger = new common_1.Logger(PassCoverageCheckerService_1.name);
    }
    checkCoverage(segment, passProfile) {
        if (passProfile.passType === 'ONE_COUNTRY') {
            const covered = segment.fromCountryCode === segment.toCountryCode;
            return {
                covered,
                status: covered ? 'COVERED' : 'NOT_COVERED',
                explanation: covered
                    ? 'One Country Pass 覆盖该国境内的铁路线路'
                    : 'One Country Pass 仅覆盖指定国家，不覆盖跨国线路',
                includesCityTransport: false,
            };
        }
        return this.checkGlobalPassCoverage(segment, passProfile);
    }
    checkGlobalPassCoverage(segment, passProfile) {
        if (passProfile.passType === 'ONE_COUNTRY') {
            const isCrossBorder = segment.fromCountryCode !== segment.toCountryCode;
            if (isCrossBorder) {
                return {
                    covered: false,
                    status: 'NOT_COVERED',
                    explanation: 'One Country Pass 仅限该国境内网络，不能用于跨境段。需要额外购买点对点票或升级为 Global Pass',
                    includesCityTransport: false,
                    alternatives: [
                        {
                            type: 'METRO',
                            description: '在边境站下车，换乘其他交通方式',
                        },
                        {
                            type: 'TAXI',
                            description: '购买跨境段的单独车票',
                        },
                    ],
                };
            }
        }
        const isCityTransport = this.isCityTransport(segment);
        if (isCityTransport) {
            return {
                covered: false,
                status: 'NOT_COVERED',
                explanation: 'Pass 一般只覆盖火车（trains），城市地铁/公交/有轨电车（trams/buses/metros）不包含（可能有少数合作折扣，但不保证）',
                includesCityTransport: false,
                alternatives: this.generateCityTransportAlternatives(segment),
            };
        }
        if (segment.isInternational || segment.isHighSpeed || segment.isNightTrain) {
            const operatorCovered = this.checkOperatorCoverage(segment);
            if (operatorCovered) {
                return {
                    covered: true,
                    status: 'COVERED',
                    explanation: '该线路在 Global Pass 覆盖范围内',
                    includesCityTransport: false,
                };
            }
        }
        return {
            covered: true,
            status: 'UNKNOWN',
            explanation: '需要进一步查询该线路是否在 Pass 覆盖范围内，建议咨询官方或查看 Rail Planner',
            includesCityTransport: false,
        };
    }
    isCityTransport(segment) {
        if (segment.operatorHint) {
            const operator = segment.operatorHint.toUpperCase();
            for (const notCovered of USUALLY_NOT_COVERED) {
                if (operator.includes(notCovered)) {
                    return true;
                }
            }
        }
        return false;
    }
    checkOperatorCoverage(segment) {
        if (!segment.operatorHint) {
            return true;
        }
        const operator = segment.operatorHint.toUpperCase();
        for (const coveredOp of COVERED_OPERATORS) {
            if (operator.includes(coveredOp)) {
                return true;
            }
        }
        return false;
    }
    generateCityTransportAlternatives(segment) {
        return [
            {
                type: 'METRO',
                description: '使用城市地铁',
                estimatedCost: 2.5,
                estimatedTimeMinutes: 20,
            },
            {
                type: 'BUS',
                description: '使用城市公交',
                estimatedCost: 2.0,
                estimatedTimeMinutes: 30,
            },
            {
                type: 'WALK',
                description: '步行（如果距离较近）',
                estimatedCost: 0,
                estimatedTimeMinutes: 15,
            },
            {
                type: 'TAXI',
                description: '打车（最快但最贵）',
                estimatedCost: 15,
                estimatedTimeMinutes: 10,
            },
        ];
    }
};
exports.PassCoverageCheckerService = PassCoverageCheckerService;
exports.PassCoverageCheckerService = PassCoverageCheckerService = PassCoverageCheckerService_1 = __decorate([
    (0, common_1.Injectable)()
], PassCoverageCheckerService);
//# sourceMappingURL=pass-coverage-checker.service.js.map