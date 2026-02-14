import { CreateItineraryItemDto } from './create-itinerary-item.dto';
export declare enum CascadeMode {
    AUTO = "auto",
    NONE = "none"
}
declare const UpdateItineraryItemDto_base: import("@nestjs/common").Type<Partial<CreateItineraryItemDto>>;
export declare class UpdateItineraryItemDto extends UpdateItineraryItemDto_base {
    cascadeMode?: CascadeMode;
}
export {};
