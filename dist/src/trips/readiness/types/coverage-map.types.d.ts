export interface ReadinessScoreBreakdown {
    overall: number;
    evidenceCoverage: number;
    scheduleFeasibility: number;
    transportCertainty: number;
    safetyRisk: number;
    buffers: number;
}
export interface ReadinessScoreFinding {
    id: string;
    type: 'blocker' | 'must' | 'should' | 'warning' | 'suggestion';
    category: string;
    message: string;
    severity: 'high' | 'medium' | 'low';
    affectedDays?: number[];
    actionRequired?: string;
}
export interface ReadinessScoreRisk {
    id: string;
    type: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
    mitigation?: string[];
    affectedPois?: string[];
}
export interface ReadinessScoreResponse {
    tripId: string;
    score: ReadinessScoreBreakdown;
    findings: ReadinessScoreFinding[];
    risks: ReadinessScoreRisk[];
    summary: {
        totalFindings: number;
        blockers: number;
        must: number;
        should: number;
        warnings?: number;
        suggestions?: number;
        highRisks: number;
        mediumRisks: number;
        lowRisks: number;
    };
    calculatedAt: string;
}
export interface RepairOptionsRequest {
    tripId: string;
    blockerId: string;
}
export interface RepairOption {
    id: string;
    title: string;
    description: string;
    cost?: number;
    impact: 'high' | 'medium' | 'low';
    timeEstimate?: string;
    actionType?: string;
    metadata?: Record<string, any>;
}
export interface RepairOptionsResponse {
    blockerId: string;
    blockerMessage?: string;
    options: RepairOption[];
}
export interface Coordinates {
    lat: number;
    lng: number;
}
export interface MapBounds {
    northeast: Coordinates;
    southwest: Coordinates;
}
export type PoiCoverageStatus = 'covered' | 'partial' | 'uncovered';
export type SegmentCoverageStatus = 'covered' | 'warning' | 'blocked';
export type EvidenceType = 'opening_hours' | 'weather' | 'road_closure' | 'booking_confirmation' | 'permit' | 'other';
export interface SegmentHazard {
    type: string;
    severity: 'high' | 'medium' | 'low';
    message: string;
}
export interface PoiCoverage {
    id: string;
    day: number;
    order: number;
    name: string;
    type: string;
    coordinates: Coordinates;
    coverageStatus: PoiCoverageStatus;
    evidenceCount: number;
    evidenceTypes?: EvidenceType[];
    missingEvidence?: EvidenceType[];
    metadata?: any;
}
export interface SegmentCoverage {
    id: string;
    fromPoiId: string;
    toPoiId: string;
    day: number;
    distance: number;
    duration: number;
    routeType: 'driving' | 'walking' | 'transit' | 'cycling';
    coverageStatus: SegmentCoverageStatus;
    polyline: string;
    hazards: SegmentHazard[];
}
export interface EvidenceStatus {
    type: EvidenceType;
    status: 'fetched' | 'missing' | 'fetching' | 'failed';
    lastUpdated?: string;
    source?: string;
}
export interface CoverageGap {
    id: string;
    type: 'poi' | 'segment';
    relatedId: string;
    coordinates: Coordinates;
    severity: 'high' | 'medium' | 'low';
    message: string;
    missingEvidence?: EvidenceType[];
    hazards?: string[];
    hazardType?: string;
    evidenceStatus?: EvidenceStatus[];
    affectedDays?: number[];
    affectedPois?: string[];
}
export interface CoverageSummary {
    totalPois: number;
    coveredPois: number;
    partialPois: number;
    uncoveredPois: number;
    totalSegments: number;
    coveredSegments: number;
    warningSegments: number;
    blockedSegments: number;
    totalGaps: number;
    coverageRate: number;
}
export interface CoverageMapData {
    tripId: string;
    bounds: MapBounds;
    center: Coordinates;
    zoom: number;
    pois: PoiCoverage[];
    segments: SegmentCoverage[];
    gaps: CoverageGap[];
    summary: CoverageSummary;
    deduplicatedWarnings?: CoverageGap[];
    warningsBySeverity?: {
        high: CoverageGap[];
        medium: CoverageGap[];
        low: CoverageGap[];
    };
    evidenceStatusSummary?: {
        total: number;
        fetched: number;
        missing: number;
        fetching: number;
        failed: number;
    };
    calculatedAt: string;
    dataFreshness?: {
        weather?: string;
        roadClosure?: string;
        openingHours?: string;
    };
}
