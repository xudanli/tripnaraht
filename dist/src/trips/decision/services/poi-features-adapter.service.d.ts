import { SvalbardPoiFeaturesService, SvalbardGeoFeatures } from '../../../places/services/svalbard-poi-features.service';
import { IcelandPoiFeaturesService, IcelandGeoFeatures } from '../../../places/services/iceland-poi-features.service';
export type PoiFeatures = SvalbardGeoFeatures | IcelandGeoFeatures;
export interface PoiFeaturesContext {
    destination: string;
    region?: string;
}
export declare class PoiFeaturesAdapterService {
    private readonly svalbardFeatures;
    private readonly icelandFeatures;
    private readonly logger;
    constructor(svalbardFeatures: SvalbardPoiFeaturesService, icelandFeatures: IcelandPoiFeaturesService);
    getPoiFeatures(context: PoiFeaturesContext): Promise<PoiFeatures | null>;
    private inferIcelandRegion;
    isIcelandFeatures(features: PoiFeatures): features is IcelandGeoFeatures;
    isSvalbardFeatures(features: PoiFeatures): features is SvalbardGeoFeatures;
}
