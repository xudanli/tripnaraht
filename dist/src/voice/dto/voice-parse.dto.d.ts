export declare class StopDto {
    kind: string;
    id: string;
    name?: string;
    startMin: number;
    endMin: number;
    lat?: number;
    lng?: number;
}
export declare class DayScheduleResultDto {
    stops: StopDto[];
    metrics?: Record<string, any>;
}
export declare class VoiceParseRequestDto {
    transcript: string;
    schedule: DayScheduleResultDto;
}
