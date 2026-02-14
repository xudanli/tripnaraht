export type StopKind = 'POI' | 'REST' | 'MEAL' | 'HOTEL' | 'TRANSFER';
export interface RestStop {
    id: string;
    kind: 'REST';
    name: string;
    lat: number;
    lng: number;
    tags: string[];
    restBenefit: {
        regenHp: number;
        comfortScore: number;
        recommendedMin: number;
        minMin: number;
    };
    wheelchairAccess?: boolean;
    restroomNearby?: boolean;
    seatingAvailable?: boolean;
}
