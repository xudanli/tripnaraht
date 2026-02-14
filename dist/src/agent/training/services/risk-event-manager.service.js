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
var RiskEventManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskEventManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const crypto_1 = require("crypto");
let RiskEventManagerService = RiskEventManagerService_1 = class RiskEventManagerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(RiskEventManagerService_1.name);
        this.events = new Map();
    }
    async classifyRiskEvent(requestId, violations, category, description) {
        this.logger.log(`[RiskEventManager] 分级风险事件: requestId=${requestId}, violations=${violations.length}`);
        const sevLevel = this.determineSevLevel(violations);
        let status = 'PENDING';
        if (sevLevel === 'SEV-1') {
            status = 'REJECTED';
        }
        else if (sevLevel === 'SEV-2') {
            status = 'PENDING';
        }
        else {
            status = 'PENDING';
        }
        const event = {
            event_id: `risk_${(0, crypto_1.randomUUID)()}`,
            request_id: requestId,
            sev_level: sevLevel,
            category,
            description,
            violations,
            status,
            created_at: new Date().toISOString(),
            metadata: {},
        };
        this.events.set(event.event_id, event);
        if (sevLevel === 'SEV-1' || sevLevel === 'SEV-2') {
            await this.sendAlert(event);
        }
        this.logger.log(`[RiskEventManager] 风险事件已分级: eventId=${event.event_id}, sevLevel=${sevLevel}`);
        return event;
    }
    async handleRiskEvent(eventId, action, resolvedBy, mitigationDetails) {
        this.logger.log(`[RiskEventManager] 处置风险事件: eventId=${eventId}, action=${action}`);
        const event = this.events.get(eventId);
        if (!event) {
            throw new Error(`Risk event not found: ${eventId}`);
        }
        switch (action) {
            case 'APPROVE':
                event.status = 'APPROVED';
                break;
            case 'REJECT':
                event.status = 'REJECTED';
                break;
            case 'MITIGATE':
                event.status = 'MITIGATED';
                if (mitigationDetails) {
                    event.metadata.mitigation_details = mitigationDetails;
                }
                break;
        }
        event.resolved_at = new Date().toISOString();
        event.resolved_by = resolvedBy;
        this.logger.log(`[RiskEventManager] 风险事件已处置: eventId=${eventId}, status=${event.status}`);
        return event;
    }
    getRiskEvent(eventId) {
        return this.events.get(eventId);
    }
    listRiskEvents(filters) {
        let events = Array.from(this.events.values());
        if (filters) {
            if (filters.sev_level) {
                events = events.filter((e) => e.sev_level === filters.sev_level);
            }
            if (filters.status) {
                events = events.filter((e) => e.status === filters.status);
            }
            if (filters.category) {
                events = events.filter((e) => e.category === filters.category);
            }
        }
        return events.sort((a, b) => {
            const sevOrder = {
                'SEV-1': 1,
                'SEV-2': 2,
                'SEV-3': 3,
                'SEV-4': 4,
            };
            return sevOrder[a.sev_level] - sevOrder[b.sev_level];
        });
    }
    determineSevLevel(violations) {
        if (violations.length === 0) {
            return 'SEV-4';
        }
        if (violations.some((v) => v.sev_level === 'SEV-1')) {
            return 'SEV-1';
        }
        if (violations.some((v) => v.sev_level === 'SEV-2')) {
            return 'SEV-2';
        }
        if (violations.some((v) => v.sev_level === 'SEV-3')) {
            return 'SEV-3';
        }
        return 'SEV-4';
    }
    async sendAlert(event) {
        this.logger.warn(`[RiskEventManager] ⚠️ 风险事件告警: eventId=${event.event_id}, sevLevel=${event.sev_level}, category=${event.category}`);
    }
};
exports.RiskEventManagerService = RiskEventManagerService;
exports.RiskEventManagerService = RiskEventManagerService = RiskEventManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RiskEventManagerService);
//# sourceMappingURL=risk-event-manager.service.js.map