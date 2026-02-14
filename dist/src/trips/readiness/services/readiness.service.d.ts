import { PrismaService } from '../../../prisma/prisma.service';
import { ReadinessPack } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';
import { ReadinessCheckResult } from '../types/readiness-findings.types';
import { TrustMetricsService } from './trust-metrics.service';
import { ReadinessChecker } from '../engine/readiness-checker';
import { FactsToReadinessCompiler } from '../compilers/facts-to-readiness.compiler';
import { ReadinessToConstraintsCompiler } from '../compilers/readiness-to-constraints.compiler';
import { PackStorageService } from '../storage/pack-storage.service';
import { TripWorldState } from '../../decision/world-model';
import { GeoFactsService } from './geo-facts.service';
export declare class ReadinessService {
    private readonly prisma;
    private readonly readinessChecker;
    private readonly factsCompiler;
    private readonly constraintsCompiler;
    private readonly packStorage;
    private readonly geoFactsService?;
    private readonly trustMetricsService?;
    private readonly logger;
    constructor(prisma: PrismaService, readinessChecker: ReadinessChecker, factsCompiler: FactsToReadinessCompiler, constraintsCompiler: ReadinessToConstraintsCompiler, packStorage: PackStorageService, geoFactsService?: GeoFactsService, trustMetricsService?: TrustMetricsService);
    extractTripContext(state: TripWorldState): TripContext;
    private generateDisclaimer;
    checkFromPacks(packs: ReadinessPack[], context: TripContext, lang?: 'en' | 'zh'): Promise<ReadinessCheckResult>;
    checkFromPackIds(packIds: string[], context: TripContext): Promise<ReadinessCheckResult>;
    checkFromDestination(destinationId: string, context: TripContext, options?: {
        enhanceWithGeo?: boolean;
        geoLat?: number;
        geoLng?: number;
        lang?: 'en' | 'zh';
    }): Promise<ReadinessCheckResult>;
    checkFromCountryFacts(countryCodes: string[], context: TripContext, lang?: 'en' | 'zh'): Promise<ReadinessCheckResult>;
    check(packs: ReadinessPack[], countryCodes: string[], context: TripContext, lang?: 'en' | 'zh'): Promise<ReadinessCheckResult>;
    getConstraints(result: ReadinessCheckResult): Promise<ReturnType<ReadinessToConstraintsCompiler['compile']>>;
    getTasks(result: ReadinessCheckResult): Promise<ReturnType<ReadinessToConstraintsCompiler['extractTasks']>>;
    getGeoFactsForDestination(destinationId: string): Promise<TripContext['geo'] | null>;
    mapCategoryToPersona(category: string): 'ABU' | 'DR_DRE' | 'NEPTUNE';
    generateDecisionLogEntries(result: ReadinessCheckResult, requestId: string): Array<{
        request_id: string;
        step: 'GATE_EVAL';
        actor: 'Gatekeeper';
        inputs_summary: string;
        outputs_summary: string;
        evidence_refs: string[];
        timestamp: string;
        metadata?: Record<string, any>;
    }>;
}
