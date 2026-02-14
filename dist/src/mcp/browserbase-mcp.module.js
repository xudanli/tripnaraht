"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserbaseMcpModule = void 0;
const common_1 = require("@nestjs/common");
const browserbase_mcp_controller_1 = require("./browserbase-mcp.controller");
const browserbase_mcp_service_1 = require("./browserbase-mcp.service");
let BrowserbaseMcpModule = class BrowserbaseMcpModule {
};
exports.BrowserbaseMcpModule = BrowserbaseMcpModule;
exports.BrowserbaseMcpModule = BrowserbaseMcpModule = __decorate([
    (0, common_1.Module)({
        controllers: [browserbase_mcp_controller_1.BrowserbaseMcpController],
        providers: [browserbase_mcp_service_1.BrowserbaseMcpService],
        exports: [browserbase_mcp_service_1.BrowserbaseMcpService],
    })
], BrowserbaseMcpModule);
//# sourceMappingURL=browserbase-mcp.module.js.map