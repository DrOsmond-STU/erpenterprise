"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
/** K-70: setiap perubahan bermakna dicatat dalam transaksi yang sama dengan perubahannya. */
let AuditService = class AuditService {
    async record(c, e) {
        await c.query(`INSERT INTO audit_log (company_id, branch_code, user_id, session_id, action, entity_type, entity_id, before, after, ip, user_agent, request_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [e.companyId, e.branchCode ?? null, e.userId ?? null, e.sessionId ?? null, e.action, e.entityType, e.entityId ?? null,
            e.before === undefined ? null : JSON.stringify(e.before), e.after === undefined ? null : JSON.stringify(e.after),
            e.ip ?? null, e.userAgent ? String(e.userAgent).slice(0, 300) : null, e.requestId ?? null]);
    }
    /** K-71: verifikasi rantai hash — mengembalikan id baris pertama yang rusak, atau null. */
    async verifyChain(c, limit = 100_000) {
        const { rows } = await c.query(`SELECT id, encode(prev_hash,'hex') AS prev, encode(hash,'hex') AS hash FROM audit_log ORDER BY id ASC LIMIT $1`, [limit]);
        let prev = null;
        for (const r of rows) {
            if ((r.prev ?? null) !== prev)
                return { checked: rows.length, brokenAt: r.id };
            prev = r.hash;
        }
        return { checked: rows.length, brokenAt: null };
    }
};
exports.AuditService = AuditService;
exports.AuditService = AuditService = __decorate([
    (0, common_1.Injectable)()
], AuditService);
//# sourceMappingURL=audit.service.js.map