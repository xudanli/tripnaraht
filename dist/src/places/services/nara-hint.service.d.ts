import { IcelandNaturePoi, NaraHint } from '../interfaces/nature-poi.interface';
export declare class NaraHintService {
    generateNaraHint(poi: IcelandNaturePoi): NaraHint;
    private getBaseHint;
    generateNaraHints(pois: IcelandNaturePoi[]): Map<string, NaraHint>;
}
