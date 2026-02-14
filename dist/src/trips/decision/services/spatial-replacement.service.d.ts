import { PrismaService } from '../../../prisma/prisma.service';
import { SpatialIssue, NeptuneInput } from '../interfaces/spatial-issue.interface';
import { ReplacementCandidate, ReplacementOperation } from '../interfaces/replacement-candidate.interface';
export declare class SpatialReplacementService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    replaceEntry(issue: SpatialIssue, input: NeptuneInput): Promise<ReplacementOperation | null>;
    replacePoi(issue: SpatialIssue, input: NeptuneInput, dayIndex: number): Promise<ReplacementOperation | null>;
    replaceSegmentCorridor(issue: SpatialIssue, input: NeptuneInput): Promise<ReplacementOperation | null>;
    private findCandidateEntriesWithinCorridor;
    private findCandidatePoisWithinCorridor;
    scoreReplacement(original: Partial<ReplacementCandidate>, candidate: ReplacementCandidate, routeDirection: NeptuneInput['routeDirection']): number;
    private jaccardSimilarity;
}
