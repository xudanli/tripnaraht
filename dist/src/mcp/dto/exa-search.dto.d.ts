export declare class ExaWebSearchDto {
    query: string;
    numResults?: number;
    useAutoprompt?: boolean;
    category?: string;
    startPublishedDate?: string;
    endPublishedDate?: string;
}
export declare class ExaCodeContextDto {
    query: string;
    numResults?: number;
    languages?: string[];
}
export declare class ExaCompanyResearchDto {
    companyName: string;
    numResults?: number;
}
export declare class ExaCrawlUrlDto {
    url: string;
    text?: boolean;
    html?: boolean;
    markdown?: boolean;
}
export declare class ExaDeepResearcherStartDto {
    query: string;
    reportType?: string;
    numResults?: number;
}
export declare class ExaDeepResearcherCheckDto {
    taskId: string;
}
