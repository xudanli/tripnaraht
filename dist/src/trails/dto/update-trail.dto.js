"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateTrailDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const create_trail_dto_1 = require("./create-trail.dto");
class UpdateTrailDto extends (0, swagger_1.PartialType)(create_trail_dto_1.CreateTrailDto) {
}
exports.UpdateTrailDto = UpdateTrailDto;
//# sourceMappingURL=update-trail.dto.js.map