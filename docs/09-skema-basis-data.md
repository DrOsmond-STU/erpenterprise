# 9 — Skema basis data

Skema relasional PostgreSQL yang memetakan model data purwarupa (dokumen 06)
ke tabel produksi. Konvensi: nama tabel jamak `snake_case`, kunci utama
`id uuid`, semua tabel memiliki `created_at`, `created_by`, `updated_at`,
`updated_by`; tabel transaksi memiliki `company_id`, `branch_id`.

Nilai uang disimpan sebagai `bigint` dalam **rupiah bulat** (bukan `float`,
bukan `numeric` dengan sen) karena IDR tidak memakai pecahan dalam praktik.
Kuantitas memakai `numeric(18,4)`.

---

## 1. Identitas dan organisasi

```sql
companies      (id, code, name, npwp, base_currency, fiscal_year_start_month)
branches       (id, company_id, code char(3), name, type, city, address,
                manager_employee_id, main_bank_account_id, petty_cash_account_id,
                is_head_office bool, status, opened_at)
fiscal_periods (id, company_id, code, label, date_from, date_to,
                status enum('open','closing','closed'), closed_at, closed_by)
users          (id, company_id, email citext unique, display_name, status,
                mfa_enabled, last_login_at, failed_logins, locked_until)
roles          (id, company_id, code, name, description)
permissions    (id, code unique)          -- mis. 'ledger.journal.post'
role_permissions (role_id, permission_id)
user_roles     (user_id, role_id, branch_id nullable)  -- NULL = semua cabang
sessions       (id, user_id, refresh_token_hash, ip, user_agent, expires_at, revoked_at)
```

`user_roles.branch_id` adalah inti pembatasan per cabang: seorang staf gudang
Surabaya memiliki peran `gudang` hanya pada `SBY`; manajer keuangan pusat
memiliki peran `keuangan` dengan `branch_id = NULL`.

---

## 2. Data master

```sql
products        (id, company_id, sku unique, name, category, uom, sale_price,
                 cost_method enum('average','fifo'), tax_code, inventory_account_id,
                 revenue_account_id, cogs_account_id, status)
customers       (id, company_id, code, name, segment, home_branch_id, credit_limit,
                 payment_terms_days, status, npwp)
suppliers       (id, company_id, code, name, category, home_branch_id,
                 payment_terms_days, status, npwp, bank_account_no)
employees       (id, company_id, nik, name, dept, title, branch_id, join_date,
                 employment_status, base_salary, allowance, user_id nullable)
chart_of_accounts (id, company_id, code unique, name, type enum('header','detail'),
                 category enum('aset','liabilitas','ekuitas','pendapatan','beban'),
                 parent_id, normal_side enum('debit','credit'),
                 is_intercompany bool, is_contra bool, is_cash bool, status)
bank_accounts   (id, company_id, branch_id, code, name, bank_name, account_no_enc,
                 currency, gl_account_id, opening_balance, opening_date, status)
```

`bank_accounts.account_no_enc` disimpan terenkripsi (dok. 11 §8).

---

## 3. Dokumen transaksi

Setiap tabel dokumen memiliki `doc_no` (unik per perusahaan, dibangkitkan
oleh `document_sequences`), `status`, `branch_id`, `period_id`, `posted_at`.

```sql
document_sequences (company_id, doc_type, year, last_no)   -- dikunci per baris saat ambil nomor

sales_orders     (id, doc_no, branch_id, customer_id, order_date, due_date, channel,
                  status, total_net, total_tax, total_gross, approved_by, approved_at)
sales_order_lines(id, sales_order_id, product_id, qty, uom, unit_price, discount_pct, amount)
deliveries       (id, doc_no, sales_order_id, branch_id, delivery_date, status)
invoices         (id, doc_no, branch_id, customer_id, sales_order_id, invoice_date,
                  due_date, total_net, total_tax, total_gross, cogs_amount, status)
receipts         (id, doc_no, branch_id, customer_id, invoice_id, receipt_date,
                  amount, bank_account_id)

purchase_requests, rfqs, purchase_orders, purchase_order_lines
goods_receipts   (id, doc_no, purchase_order_id, branch_id, receipt_date, status)
ap_invoices      (id, doc_no, branch_id, supplier_id, purchase_order_id, kind enum('goods','service'),
                  expense_account_id nullable, invoice_date, due_date, total_net, total_tax,
                  total_gross, three_way_matched bool, status)
payments         (id, doc_no, branch_id, supplier_id, ap_invoice_id, payment_date,
                  amount, bank_account_id)

stock_items      (id, product_id, branch_id, warehouse_code, on_hand, min_qty, max_qty,
                  avg_cost, UNIQUE(product_id, branch_id, warehouse_code))
stock_moves      (id, doc_no, branch_id, product_id, move_type, qty, unit_cost, ref_type,
                  ref_id, counter_branch_id nullable, move_date)

work_orders, bom_lines, wo_consumptions, wo_outputs
payroll_runs     (id, branch_id, period_id, status, processed_at, paid_at)
payslips         (id, payroll_run_id, employee_id, basic, allowance, overtime,
                  deduction, net_pay, status)
assets           (id, code, branch_id, name, category, gl_account_id, acquisition_date,
                  acquisition_cost, useful_life_months, salvage_value, status)
depreciation_runs(id, branch_id, period_id, amount, status)
maintenance_orders(id, doc_no, asset_id, branch_id, type, priority, cost, status, completed_at)
pos_shifts       (id, branch_id, store_code, cashier_user_id, opened_at, closed_at,
                  opening_cash, closing_cash, total_sales, status)
pos_transactions (id, shift_id, trx_no, trx_at, total, payment_method, status)
```

---

## 4. Buku besar

```sql
journals (
  id uuid pk, company_id, branch_id, period_id,
  journal_no text unique,                 -- JV-YYYY-NNNNNN
  journal_date date,
  source_type text,                       -- 'invoice','ap_invoice','payslip','manual',...
  source_id uuid,
  rule_code text,                         -- kode posting_rules; 'MANUAL' untuk memorial
  description text,
  status enum('draft','pending','posted','rejected','reversed'),
  total_debit bigint, total_credit bigint,
  posted_at timestamptz, posted_by uuid,
  reversed_by_journal_id uuid,
  created_at, created_by,
  UNIQUE (source_type, source_id, rule_code)          -- idempoten
)
journal_lines (
  id bigint pk, journal_id, line_no int,
  account_id, debit bigint default 0, credit bigint default 0,
  bank_account_id nullable, party_type, party_id, counter_branch_id nullable,
  memo text,
  CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0))
) PARTITION BY RANGE (journal_date_year);
posting_rules (
  id, company_id, code, source_type, event, description, active bool,
  lines jsonb   -- [{role:'debit', account: '1-1200', basis:'gross'}, {role:'credit', account:'4-1000', basis:'net'}, ...]
)
opening_balances (id, company_id, branch_id, fiscal_year, account_id, amount, source)
reconciliation_runs (id, company_id, branch_id nullable, period_id, run_at,
                     check_code, subledger_value, gl_value, diff, ok bool, note)
```

### Invarian yang ditegakkan di basis data

```sql
-- 1. Jurnal terposting seimbang
CREATE FUNCTION assert_journal_balanced() ... -- trigger AFTER INSERT/UPDATE ON journal_lines,
-- DEFERRABLE INITIALLY DEFERRED: Σ debit = Σ kredit per journal_id saat COMMIT.

-- 2. Hanya akun detail yang menerima baris
ALTER TABLE journal_lines ADD CONSTRAINT lines_detail_only
  CHECK (account_is_detail(account_id));

-- 3. Jurnal terposting tidak dapat diubah/dihapus
CREATE TRIGGER journals_immutable BEFORE UPDATE OR DELETE ON journals
  FOR EACH ROW WHEN (OLD.status = 'posted')
  EXECUTE FUNCTION raise_immutable();   -- kecuali transisi posted -> reversed oleh fungsi reverse_journal()

-- 4. Tidak ada posting ke periode tertutup
CREATE TRIGGER journals_period_open BEFORE INSERT OR UPDATE OF status ON journals
  ... WHEN NEW.status = 'posted' AND period_status(NEW.period_id) <> 'open' THEN RAISE

-- 5. Baris kas wajib menyebut rekening, dan rekening milik cabang jurnal
CHECK ((account_is_cash(account_id) = false) OR bank_account_id IS NOT NULL)
```

Saldo dibaca dari *materialized view* `account_daily_balances
(branch_id, account_id, date, debit, credit)` yang di-*refresh* inkremental
per jurnal terposting.

---

## 5. Alur kerja dan audit

```sql
approval_requests (id, company_id, branch_id, doc_type, doc_id, workflow_code,
                   current_step, status, requested_by, requested_at, reason)
approval_steps    (id, request_id, step_no, approver_role_id, approver_user_id,
                   decision enum('approved','rejected'), decided_at, note)
audit_log (
  id bigint, at timestamptz, company_id, branch_id, user_id, session_id,
  action text, entity_type, entity_id, before jsonb, after jsonb,
  ip inet, user_agent text, request_id text,
  prev_hash bytea, hash bytea            -- rantai hash (dok. 11 §10)
)  -- append-only: REVOKE UPDATE, DELETE ON audit_log FROM app_role
```

---

## 6. Row-level security (isolasi cabang)

Aplikasi terhubung sebagai peran `app_role` dan menyetel konteks per transaksi:

```sql
SET LOCAL app.user_id = '...'; SET LOCAL app.company_id = '...';
SET LOCAL app.branch_ids = '{CKR,SBY}';   -- atau '*' untuk lintas cabang
```

Kebijakan pada setiap tabel transaksi dan `journals`:

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_branch ON invoices
  USING (company_id = current_setting('app.company_id')::uuid
         AND (current_setting('app.branch_ids') = '*'
              OR branch_id = ANY (string_to_array(current_setting('app.branch_ids'), ','))));
```

RLS adalah lapisan kedua di bawah pemeriksaan otorisasi aplikasi; keduanya
harus lolos.

---

## 7. Indeks utama

| Tabel | Indeks | Untuk |
| --- | --- | --- |
| `journal_lines` | `(account_id, journal_date)`; `(journal_id)`; `(bank_account_id, journal_date)` | Kartu buku besar, rekening bank |
| `journals` | `(branch_id, period_id, status)`; unik `(source_type, source_id, rule_code)` | Register, idempoten |
| `invoices`, `ap_invoices` | `(branch_id, status, due_date)` | Umur piutang/hutang |
| `stock_moves` | `(product_id, branch_id, move_date)` | Kartu stok |
| `audit_log` | `(entity_type, entity_id, at)`; `(user_id, at)` | Jejak audit |

---

## 8. Migrasi dari purwarupa

1. Muat `chart_of_accounts` dari `DATA.chartOfAccounts`; tambahkan
   `normal_side`, `is_intercompany`, `is_cash`.
2. Muat cabang, periode, rekening bank, master.
3. Impor saldo awal per cabang ke `opening_balances` dan bentuk jurnal
   `OPN-<tahun>-<cabang>` (sumber `opening`).
4. Impor dokumen historis; jalankan worker posting; jalankan 11 pemeriksaan
   rekonsiliasi — migrasi diterima hanya jika semuanya `ok`.
