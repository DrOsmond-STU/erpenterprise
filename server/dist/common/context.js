"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReqId = exports.Scope = exports.CurrentUser = exports.Public = exports.PUBLIC_KEY = exports.RequirePermission = exports.PERMISSION_KEY = void 0;
const common_1 = require("@nestjs/common");
exports.PERMISSION_KEY = 'erp:permission';
const RequirePermission = (...perms) => (0, common_1.SetMetadata)(exports.PERMISSION_KEY, perms);
exports.RequirePermission = RequirePermission;
exports.PUBLIC_KEY = 'erp:public';
const Public = () => (0, common_1.SetMetadata)(exports.PUBLIC_KEY, true);
exports.Public = Public;
exports.CurrentUser = (0, common_1.createParamDecorator)((_, ctx) => {
    return ctx.switchToHttp().getRequest().user;
});
exports.Scope = (0, common_1.createParamDecorator)((_, ctx) => {
    return ctx.switchToHttp().getRequest().scope;
});
exports.ReqId = (0, common_1.createParamDecorator)((_, ctx) => {
    return ctx.switchToHttp().getRequest().requestId;
});
//# sourceMappingURL=context.js.map