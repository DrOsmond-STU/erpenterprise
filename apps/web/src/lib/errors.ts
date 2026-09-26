/** Mengubah galat API (termasuk rincian validasi zod) menjadi daftar pesan untuk formulir. */
export function errorList(e: any): string[] {
  if (Array.isArray(e?.details) && e.details.length) {
    return e.details.map((d: any) => (typeof d === 'string' ? d : d?.path ? `${Array.isArray(d.path) ? d.path.join('.') : d.path}: ${d.message}` : d?.message ?? String(d)));
  }
  return [e?.message ?? 'Terjadi kesalahan.'];
}
