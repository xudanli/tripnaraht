export declare class RiskTypeMapperService {
    private readonly TYPE_LABELS;
    getTypeLabel(type: string, lang?: 'en' | 'zh'): string;
    private normalizeRiskType;
    getCategory(type: string): 'weather' | 'terrain' | 'safety' | 'logistics' | 'other';
    getIcon(type: string): string;
    getTypeDescription(type: string, lang?: 'en' | 'zh'): string;
    getSeverityLabel(severity: 'high' | 'medium' | 'low' | string, lang?: 'en' | 'zh'): string;
    enhanceRisk(risk: {
        id: string;
        type: string;
        severity: string | 'high' | 'medium' | 'low';
        message?: string;
        summary?: string;
        mitigation?: string[];
        affectedPois?: any[];
        sources?: any[];
    }, lang?: 'en' | 'zh'): any;
    private generateImpactDescription;
    private generateMitigationDetails;
    groupRisksByCategory(risks: any[]): Record<string, any[]>;
}
