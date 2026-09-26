"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolsFor = exports.TOOLS = void 0;
exports.scopeFor = scopeFor;
const zod_1 = require("zod");
const errors_js_1 = require("../common/errors.js");
const cabang = { type: 'string', description: 'Kode cabang tiga huruf (mis. JKT, SBY), atau "ALL" untuk seluruh cabang. Kosongkan untuk memakai konteks cabang yang sedang dipilih pengguna.' };
const periode = { type: 'string', description: 'Kode periode fiskal (mis. 2026-08, 2026-Q3). Kosongkan untuk memakai periode yang sedang dipilih pengguna.' };
const scopeProps = { cabang, periode };
const scopeInput = zod_1.z.object({ cabang: zod_1.z.string().trim().max(5).optional(), periode: zod_1.z.string().trim().max(12).optional() });
/** Menerapkan cabang/periode yang diminta model dengan aturan yang sama seperti BranchContextGuard. */
function scopeFor(u, base, input) {
    let s = { ...base };
    const raw = input.cabang?.trim().toUpperCase();
    if (raw) {
        if (raw === 'ALL' || raw === 'SEMUA') {
            if (!(u.branches === '*' || u.permissions.has('report.consolidated')))
                throw (0, errors_js_1.forbidden)('Konteks "Semua cabang" memerlukan izin laporan konsolidasi.');
            s = { ...s, branch: 'ALL', rlsBranches: u.branches };
        }
        else {
            if (!/^[A-Z]{3}$/.test(raw))
                throw (0, errors_js_1.forbidden)('Kode cabang tidak sah.');
            if (u.branches !== '*' && !u.branches.includes(raw))
                throw (0, errors_js_1.forbidden)(`Pengguna tidak memiliki akses ke cabang ${raw}.`);
            s = { ...s, branch: raw, rlsBranches: [raw] };
        }
    }
    const p = input.periode?.trim().toUpperCase();
    if (p) {
        if (!/^[0-9A-Z-]{4,12}$/.test(p))
            throw (0, errors_js_1.forbidden)('Kode periode tidak sah.');
        s = { ...s, period: p };
    }
    return s;
}
const periodOf = (p) => ({ kode: p.id, label: p.label, dari: p.from, sampai: p.to });
/* Urutan tetap (deterministik) agar awalan permintaan stabil. */
exports.TOOLS = [
    {
        permission: 'ledger.report.read',
        spec: {
            name: 'ringkasan_kpi',
            description: 'Indikator utama untuk satu cakupan cabang dan periode: pendapatan, laba kotor, laba bersih, margin, target penjualan, kas, piutang, hutang, faktur jatuh tempo, jurnal menunggu posting, dan pendapatan bulanan setahun. Pakai untuk pertanyaan umum tentang kinerja.',
            input_schema: { type: 'object', properties: scopeProps, additionalProperties: false },
        },
        run: async ({ reports }, c, input) => {
            const i = scopeInput.parse(input);
            const r = await reports.kpis(c.user, scopeFor(c.user, c.scope, i), c.requestId);
            return { ...r, period: periodOf(r.period) };
        },
    },
    {
        permission: 'ledger.report.read',
        spec: {
            name: 'neraca_saldo',
            description: 'Neraca saldo: saldo debit/kredit setiap akun detail beserta total dan status seimbang. Dengan per_cabang=true dan cabang ALL, mengembalikan kolom per cabang, eliminasi RK antar kantor, dan hasil konsolidasi.',
            input_schema: { type: 'object', properties: { ...scopeProps, per_cabang: { type: 'boolean', description: 'Tampilkan saldo per cabang (hanya bila cabang = ALL).' } }, additionalProperties: false },
        },
        run: async ({ reports }, c, input) => {
            const i = scopeInput.extend({ per_cabang: zod_1.z.boolean().optional() }).parse(input);
            const r = await reports.trialBalance(c.user, scopeFor(c.user, c.scope, i), i.per_cabang === true, c.requestId);
            return { ...r, period: periodOf(r.period) };
        },
    },
    {
        permission: 'ledger.report.read',
        spec: {
            name: 'laba_rugi',
            description: 'Laporan laba rugi: pendapatan, harga pokok penjualan, laba kotor, beban operasional per akun, pendapatan/beban lain, laba bersih, dan margin.',
            input_schema: { type: 'object', properties: scopeProps, additionalProperties: false },
        },
        run: async ({ reports }, c, input) => {
            const r = await reports.incomeStatement(c.user, scopeFor(c.user, c.scope, scopeInput.parse(input)), c.requestId);
            return { ...r, period: periodOf(r.period) };
        },
    },
    {
        permission: 'ledger.report.read',
        spec: {
            name: 'neraca',
            description: 'Neraca (posisi keuangan) per akhir periode: aset, liabilitas, ekuitas termasuk laba periode berjalan, dan status seimbang.',
            input_schema: { type: 'object', properties: scopeProps, additionalProperties: false },
        },
        run: async ({ reports }, c, input) => {
            const r = await reports.balanceSheet(c.user, scopeFor(c.user, c.scope, scopeInput.parse(input)), c.requestId);
            return { ...r, period: periodOf(r.period) };
        },
    },
    {
        permission: 'report.consolidated',
        spec: {
            name: 'konsolidasi',
            description: 'Laporan konsolidasi seluruh cabang aktif: KPI per cabang (pendapatan, laba, margin, kas, piutang, hutang, total aset), laba rugi dan neraca gabungan setelah eliminasi RK Cabang ↔ RK Kantor Pusat, serta selisih antar kantor. Pakai untuk membandingkan cabang.',
            input_schema: { type: 'object', properties: { periode }, additionalProperties: false },
        },
        run: async ({ reports }, c, input) => {
            const i = zod_1.z.object({ periode: zod_1.z.string().trim().max(12).optional() }).parse(input);
            const r = await reports.consolidation(c.user, scopeFor(c.user, c.scope, i), c.requestId);
            return {
                period: periodOf(r.period), branches: r.branches, kpiPerCabang: r.kpis,
                labaRugiGabungan: r.incomeStatement.combined, neracaGabungan: r.balanceSheet.combined,
                eliminasi: r.balanceSheet.eliminations, selisihAntarKantor: r.intercompanyMismatch,
            };
        },
    },
    {
        permission: 'ledger.report.read',
        spec: {
            name: 'kartu_buku_besar',
            description: 'Kartu buku besar satu akun detail: saldo awal, mutasi debit/kredit, saldo berjalan, dan saldo akhir. Baris dibatasi 80 mutasi terakhir; total tetap mencakup seluruh periode.',
            input_schema: {
                type: 'object',
                properties: { kode_akun: { type: 'string', description: 'Kode akun detail berformat 9-9999, mis. 1-1100 (kas), 1-1200 (piutang usaha), 4-1100 (penjualan).' }, rekening_bank: { type: 'string', description: 'Opsional: kode rekening bank untuk menyaring mutasi kas/bank.' }, ...scopeProps },
                required: ['kode_akun'], additionalProperties: false,
            },
        },
        run: async ({ reports }, c, input) => {
            const i = scopeInput.extend({ kode_akun: zod_1.z.string().regex(/^\d-\d{4}$/), rekening_bank: zod_1.z.string().regex(/^[A-Z0-9-]{3,30}$/).optional() }).parse(input);
            const r = await reports.ledgerCard(c.user, scopeFor(c.user, c.scope, i), i.kode_akun, i.rekening_bank ?? null, c.requestId);
            const lines = r.lines.slice(-80).map((l) => ({ tanggal: l.date, jurnal: l.journal_no, uraian: l.description, ref: l.ref, sumber: l.source, cabang: l.branch, debit: l.debit, kredit: l.credit, saldo: l.balance }));
            return { period: periodOf(r.period), scope: r.scope, account: r.account, opening: r.opening, debit: r.debit, credit: r.credit, ending: r.ending, jumlahMutasi: r.lines.length, mutasiTerakhir: lines };
        },
    },
    {
        permission: 'ledger.journal.read',
        spec: {
            name: 'daftar_jurnal',
            description: 'Mencari jurnal umum (25 per halaman, terbaru dahulu) dengan saringan status, modul sumber, akun, atau kata kunci pada nomor/uraian/referensi.',
            input_schema: {
                type: 'object',
                properties: {
                    cabang,
                    status: { type: 'string', enum: ['draft', 'pending', 'posted', 'rejected', 'reversed'] },
                    sumber: { type: 'string', description: 'Modul sumber: invoice, ap_invoice, stock_move, work_order, payslip, depreciation, maintenance, pos_shift, cash, tax, opening, manual.' },
                    akun: { type: 'string', description: 'Kode akun berformat 9-9999.' },
                    cari: { type: 'string', description: 'Kata kunci.' },
                    halaman: { type: 'integer', minimum: 1 },
                },
                additionalProperties: false,
            },
        },
        run: async ({ journals }, c, input) => {
            const i = zod_1.z.object({
                cabang: zod_1.z.string().trim().max(5).optional(),
                status: zod_1.z.enum(['draft', 'pending', 'posted', 'rejected', 'reversed']).optional(),
                sumber: zod_1.z.string().regex(/^[a-z_-]{2,30}$/).optional(),
                akun: zod_1.z.string().regex(/^\d-\d{4}$/).optional(),
                cari: zod_1.z.string().trim().max(100).optional(),
                halaman: zod_1.z.number().int().min(1).max(200).optional(),
            }).parse(input);
            const r = await journals.list(c.user, scopeFor(c.user, c.scope, { cabang: i.cabang }), { status: i.status, source: i.sumber, account: i.akun, q: i.cari, page: i.halaman ?? 1, size: 25 }, c.requestId);
            return r;
        },
    },
    {
        permission: 'ledger.report.read',
        spec: {
            name: 'rekonsiliasi',
            description: 'Hasil rekonsiliasi sub-buku terhadap buku besar (piutang, hutang, bank, persediaan, aset, utang gaji, keseimbangan neraca saldo & neraca, RK antar kantor) dan ringkasan posting per modul.',
            input_schema: { type: 'object', properties: scopeProps, additionalProperties: false },
        },
        run: async ({ recon }, c, input) => {
            const r = await recon.forScope(c.user, scopeFor(c.user, c.scope, scopeInput.parse(input)), c.requestId);
            return { ...r, period: periodOf(r.period) };
        },
    },
    {
        permission: 'ledger.account.read',
        spec: {
            name: 'bagan_akun',
            description: 'Bagan akun lengkap (kode, nama, jenis header/detail, kategori) beserta saldo akhir periode. Pakai untuk mencari kode akun.',
            input_schema: { type: 'object', properties: scopeProps, additionalProperties: false },
        },
        run: async ({ reports }, c, input) => {
            const r = await reports.chartOfAccounts(c.user, scopeFor(c.user, c.scope, scopeInput.parse(input)), c.requestId);
            return { period: periodOf(r.period), scope: r.scope, accounts: r.accounts.map((a) => ({ kode: a.code, nama: a.name, jenis: a.type, kategori: a.category, saldo: a.balance })) };
        },
    },
    {
        permission: 'ledger.report.read',
        spec: {
            name: 'saldo_kas_bank',
            description: 'Saldo setiap rekening kas dan bank per akhir periode.',
            input_schema: { type: 'object', properties: scopeProps, additionalProperties: false },
        },
        run: async ({ reports }, c, input) => {
            const r = await reports.bankBalances(c.user, scopeFor(c.user, c.scope, scopeInput.parse(input)), c.requestId);
            return { ...r, period: periodOf(r.period) };
        },
    },
    {
        permission: 'sales.invoice.read',
        spec: {
            name: 'piutang_usaha',
            description: 'Piutang usaha per akhir periode (paling lambat hari ini): total, jatuh tempo, DSO, tertagih periode ini, umur piutang per ember, piutang per pelanggan, dan daftar faktur terbuka dengan hari keterlambatan. Pakai untuk pertanyaan penagihan, pelanggan menunggak, atau umur piutang.',
            input_schema: { type: 'object', properties: scopeProps, additionalProperties: false },
        },
        run: async ({ invoices }, c, input) => {
            const r = await invoices.receivables(c.user, scopeFor(c.user, c.scope, scopeInput.parse(input)), c.requestId);
            return {
                per_tanggal: r.asOf, periode: periodOf(r.period), cakupan: r.scope, kpi: r.kpi, umur: r.aging,
                pelanggan: r.customers.slice(0, 30),
                faktur_terbuka: r.invoices.slice(0, 40).map((i) => ({ nomor: i.docNo, cabang: i.branch, pelanggan: i.customerName, tanggal: i.date, jatuh_tempo: i.dueDate, total: i.total, sisa: i.open, hari_terlambat: i.overdueDays })),
            };
        },
    },
];
const toolsFor = (u) => exports.TOOLS.filter((t) => u.permissions.has(t.permission));
exports.toolsFor = toolsFor;
//# sourceMappingURL=assistant.tools.js.map