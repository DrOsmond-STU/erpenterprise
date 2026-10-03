/** Validasi dimensi proyek pada dokumen: proyek ada, satu cabang dengan dokumen, dan belum selesai/batal. */
import type { PoolClient } from 'pg';
import { invalid, UUID } from '../sales/sales.shared.js';

export async function assertProject(c: PoolClient, companyId: string, id: string | null | undefined, branch: string): Promise<string | null> {
  if (!id) return null;
  if (!UUID.test(id)) throw invalid('PROJECT_UNKNOWN', 'Proyek tidak dikenal.');
  const p = (await c.query('SELECT code, status, trim(branch_code) AS branch FROM projects WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
  if (!p) throw invalid('PROJECT_UNKNOWN', 'Proyek tidak dikenal.');
  if (p.branch !== branch) throw invalid('PROJECT_BRANCH', `Proyek ${p.code} milik cabang ${p.branch}; dokumen cabang ${branch}.`);
  if (['selesai', 'batal'].includes(p.status)) throw invalid('PROJECT_CLOSED', `Proyek ${p.code} berstatus ${p.status}; tidak dapat menerima biaya baru.`);
  return id;
}
