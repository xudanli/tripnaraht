import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { GeoAgentService } from './geo-agent.service';
import { WeatherAgentService } from './weather-agent.service';
import { CostAgentService } from './cost-agent.service';
import { ExperienceAgentService } from './experience-agent.service';
import { DomainAgentErrorHandler } from './domain-agent-error-handler.service';

/**
 * Domain Agents Module
 * 
 * Architecture Layer: World Model & Context Layer
 * 
 * This module provides the four Domain Agents that supply world model data
 * to the Decision Core Engine:
 * 
 * - GeoAgent: Geographic structure analysis, route feasibility, spatial relations
 * - WeatherAgent: Weather forecasts, road closure probability, weather risk quantification
 * - CostAgent: Price curve analysis, budget optimization, cost estimation
 * - ExperienceAgent: Experience density analysis, fatigue prediction, pace optimization
 * 
 * These agents wrap existing services and provide a unified interface
 * for the AI-native decision system.
 */
@Module({
  imports: [
    PrismaModule,
  ],
  providers: [
    GeoAgentService,
    WeatherAgentService,
    CostAgentService,
    ExperienceAgentService,
    DomainAgentErrorHandler,
  ],
  exports: [
    GeoAgentService,
    WeatherAgentService,
    CostAgentService,
    ExperienceAgentService,
    DomainAgentErrorHandler,
  ],
})
export class DomainAgentsModule {}
