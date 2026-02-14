import { PrismaService } from '../../prisma/prisma.service';
import { PackKPIAcceptanceResult } from '../interfaces/pack-kpi.interface';
import { RouteDirectionSelectorService } from './route-direction-selector.service';
export declare class PackKPIAcceptanceService {
    private readonly prisma;
    private readonly routeSelector;
    private readonly logger;
    constructor(prisma: PrismaService, routeSelector: RouteDirectionSelectorService);
    acceptPackKPI(countryCode: string): Promise<PackKPIAcceptanceResult>;
    private calculatePersonalityKPI;
    private calculateConstraintCombinationKPI;
    private calculateUserPreferenceDifferentiationKPI;
}
