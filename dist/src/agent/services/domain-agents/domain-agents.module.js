"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainAgentsModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../../../prisma/prisma.module");
const geo_agent_service_1 = require("./geo-agent.service");
const weather_agent_service_1 = require("./weather-agent.service");
const cost_agent_service_1 = require("./cost-agent.service");
const experience_agent_service_1 = require("./experience-agent.service");
const domain_agent_error_handler_service_1 = require("./domain-agent-error-handler.service");
let DomainAgentsModule = class DomainAgentsModule {
};
exports.DomainAgentsModule = DomainAgentsModule;
exports.DomainAgentsModule = DomainAgentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
        ],
        providers: [
            geo_agent_service_1.GeoAgentService,
            weather_agent_service_1.WeatherAgentService,
            cost_agent_service_1.CostAgentService,
            experience_agent_service_1.ExperienceAgentService,
            domain_agent_error_handler_service_1.DomainAgentErrorHandler,
        ],
        exports: [
            geo_agent_service_1.GeoAgentService,
            weather_agent_service_1.WeatherAgentService,
            cost_agent_service_1.CostAgentService,
            experience_agent_service_1.ExperienceAgentService,
            domain_agent_error_handler_service_1.DomainAgentErrorHandler,
        ],
    })
], DomainAgentsModule);
//# sourceMappingURL=domain-agents.module.js.map