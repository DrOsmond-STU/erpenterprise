"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZodValidationPipe = void 0;
const common_1 = require("@nestjs/common");
const errors_js_1 = require("./errors.js");
class ZodValidationPipe {
    schema;
    constructor(schema) {
        this.schema = schema;
    }
    transform(value) {
        const r = this.schema.safeParse(value);
        if (r.success)
            return r.data;
        throw new errors_js_1.DomainError('VALIDATION', 'Data masukan tidak sah.', common_1.HttpStatus.UNPROCESSABLE_ENTITY, r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    }
}
exports.ZodValidationPipe = ZodValidationPipe;
//# sourceMappingURL=zod.pipe.js.map