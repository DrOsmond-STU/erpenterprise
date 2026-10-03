"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertProject = assertProject;
const sales_shared_js_1 = require("../sales/sales.shared.js");
async function assertProject(c, companyId, id, branch) {
    if (!id)
        return null;
    if (!sales_shared_js_1.UUID.test(id))
        throw (0, sales_shared_js_1.invalid)('PROJECT_UNKNOWN', 'Proyek tidak dikenal.');
    const p = (await c.query('SELECT code, status, trim(branch_code) AS branch FROM projects WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
    if (!p)
        throw (0, sales_shared_js_1.invalid)('PROJECT_UNKNOWN', 'Proyek tidak dikenal.');
    if (p.branch !== branch)
        throw (0, sales_shared_js_1.invalid)('PROJECT_BRANCH', `Proyek ${p.code} milik cabang ${p.branch}; dokumen cabang ${branch}.`);
    if (['selesai', 'batal'].includes(p.status))
        throw (0, sales_shared_js_1.invalid)('PROJECT_CLOSED', `Proyek ${p.code} berstatus ${p.status}; tidak dapat menerima biaya baru.`);
    return id;
}
//# sourceMappingURL=project.shared.js.map