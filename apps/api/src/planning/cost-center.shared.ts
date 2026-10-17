/** Validasi dimensi pusat biaya pada dokumen & jurnal: pusat biaya ada dan aktif (nilai yang tidak berubah pada dokumen lama tetap diterima). */
import type { PoolClient } from 'pg';
import { invalid, UUID } from '../sales/sales.shared.js';

export async function assertCostCenter(c: PoolClient, companyId: string, id: string | null | undefined, current?: string | null): Promise<string | null> {
  if (!id) return null;
  if (current && id === current) return id;
  if (!UUID.test(id)) throw invalid('COST_CENTER_UNKNOWN', 'Pusat biaya tidak dikenal.');
  const r = (await c.query('SELECT code, status FROM cost_centers WHERE company_id = $1 AND id = $2', [companyId, id])).rows[0];
  if (!r) throw invalid('COST_CENTER_UNKNOWN', 'Pusat biaya tidak dikenal.');
  if (r.status !== 'aktif') throw invalid('COST_CENTER_INACTIVE', `Pusat biaya ${r.code} nonaktif; tidak dapat menerima transaksi baru.`);
  return id;
}

/** Subkueri kode & nama pusat biaya untuk SELECT dokumen (alias tabel dokumen diberikan). */
export const ccColumns = (alias: string) =>
  `(SELECT cc.code FROM cost_centers cc WHERE cc.id = ${alias}.cost_center_id) AS cost_center_code, (SELECT cc.name FROM cost_centers cc WHERE cc.id = ${alias}.cost_center_id) AS cost_center_name`;

export const mapCcRef = (r: any) => ({ costCenterId: r.cost_center_id ?? null, costCenterCode: r.cost_center_code ?? null, costCenterName: r.cost_center_name ?? null });
