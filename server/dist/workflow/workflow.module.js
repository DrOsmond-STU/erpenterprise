"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowModule = void 0;
const common_1 = require("@nestjs/common");
const compliance_service_js_1 = require("./compliance.service.js");
const documents_service_js_1 = require("./documents.service.js");
const inbox_service_js_1 = require("./inbox.service.js");
const workflow_controller_js_1 = require("./workflow.controller.js");
let WorkflowModule = class WorkflowModule {
};
exports.WorkflowModule = WorkflowModule;
exports.WorkflowModule = WorkflowModule = __decorate([
    (0, common_1.Module)({ controllers: [workflow_controller_js_1.WorkflowController], providers: [inbox_service_js_1.InboxService, compliance_service_js_1.ComplianceService, documents_service_js_1.DocumentsService] })
], WorkflowModule);
//# sourceMappingURL=workflow.module.js.map