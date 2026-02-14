import { TripTemplatesService } from './trip-templates.service';
import { GetTripTemplatesQueryDto, CreateTripFromTemplateDto } from './dto/trip-template.dto';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
export declare class TripTemplatesController {
    private readonly tripTemplatesService;
    constructor(tripTemplatesService: TripTemplatesService);
    findAll(query: GetTripTemplatesQueryDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    findOne(id: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
export declare class TripsFromTemplateController {
    private readonly tripTemplatesService;
    constructor(tripTemplatesService: TripTemplatesService);
    createFromTemplate(dto: CreateTripFromTemplateDto, user?: CurrentUserPayload): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
