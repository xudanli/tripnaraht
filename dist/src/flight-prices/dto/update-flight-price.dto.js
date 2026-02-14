"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateFlightPriceDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_flight_price_dto_1 = require("./create-flight-price.dto");
class UpdateFlightPriceDto extends (0, swagger_1.PartialType)(create_flight_price_dto_1.CreateFlightPriceDto) {
}
exports.UpdateFlightPriceDto = UpdateFlightPriceDto;
//# sourceMappingURL=update-flight-price.dto.js.map