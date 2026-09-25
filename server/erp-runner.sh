#!/bin/bash
# ============================================================================
#  ERP Enterprise — penjaga proses API untuk cPanel/CloudLinux tanpa Passenger.
#  Domain : erp.semestateknologiutama.com   →  API di 127.0.0.1:3620
#
#  Cron memanggil skrip ini tiap beberapa menit. Ia mengerjakan, berurutan:
#    1. menjalankan migrasi basis data bila revisi kode berubah (Git Deploy);
#    2. menyemai data contoh bila ~/erp-config/seed.request ada
#       (baris 1 = kata sandi awal pengguna seed; berkas dihapus setelah dibaca);
#    3. mematikan proses bila ~/erp-restart.request ada;
#    4. menyalakan API bila belum/tidak berjalan.
#
#  Rahasia (DATABASE_URL, JWT_SECRET, …) ada di ~/erp-config/.env — di LUAR
#  document root dan di luar repositori, sehingga Git Deploy tidak pernah
#  menyentuhnya. Tidak ada langkah build di server: artefak (dist + node_modules)
#  dikirim jadi lewat branch deploy/hosting.
# ============================================================================
HOME_DIR=/home/semestat
DOCROOT=$HOME_DIR/erp.semestateknologiutama.com
APP_DIR=$DOCROOT/server
CONF_DIR=$HOME_DIR/erp-config
ENV_FILE=$CONF_DIR/.env
PIDFILE=$HOME_DIR/erp.pid
LOG=$HOME_DIR/erp-app.log
INSTALL_LOG=$HOME_DIR/erp-install.log
STATUS=$HOME_DIR/erp-status.txt
REV_FILE=$HOME_DIR/.erp-rev
REV_FAILED=$HOME_DIR/.erp-rev-failed
LOCKDIR=$HOME_DIR/.erp-runner.lock
SEED_REQUEST=$CONF_DIR/seed.request
RESTART_REQUEST=$HOME_DIR/erp-restart.request
MIGRATE_REQUEST=$HOME_DIR/erp-migrate.request
PORT=3620

export PATH="$HOME_DIR/.local/share/mise/installs/node/22/bin:$HOME_DIR/.local/share/mise/shims:$HOME_DIR/.local/bin:$PATH"

# Kunci direktori (atomik, tanpa descriptor yang diwarisi proses Node).
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  if [ -d "$LOCKDIR" ] && [ -z "$(find "$LOCKDIR" -maxdepth 0 -mmin -30 2>/dev/null)" ]; then
    rmdir "$LOCKDIR" 2>/dev/null && mkdir "$LOCKDIR" 2>/dev/null || exit 0
  else
    exit 0
  fi
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

# Log tidak boleh tumbuh selamanya di akun berkuota disk.
for f in "$LOG" "$INSTALL_LOG"; do
  if [ -f "$f" ] && [ "$(stat -c%s "$f" 2>/dev/null || echo 0)" -gt 5242880 ]; then
    tail -c 1048576 "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done

mkdir -p "$CONF_DIR"
[ -f "$CONF_DIR/env.example" ] || cp -f "$APP_DIR/env.example" "$CONF_DIR/env.example" 2>/dev/null
[ -f "$ENV_FILE" ] || { echo "$(date) berhenti: $ENV_FILE belum ada — salin $CONF_DIR/env.example menjadi .env lalu isi" > "$STATUS"; exit 0; }
[ -f "$APP_DIR/dist/main.js" ] || { echo "$(date) berhenti: artefak server belum terpasang" > "$STATUS"; exit 0; }
[ -d "$APP_DIR/node_modules/@nestjs/core" ] || { echo "$(date) berhenti: node_modules belum ada" > "$STATUS"; exit 0; }

export NODE_ENV=production
export PORT
export PROTOTYPE_ASSETS_DIR=$APP_DIR/prototype-assets
export NODE_OPTIONS="--max-old-space-size=320"

alive() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; }
stop_app() {
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null
    sleep 3
    rm -f "$PIDFILE"
  fi
}

cd "$APP_DIR" || exit 1
REV=$(git -C "$DOCROOT" rev-parse HEAD 2>/dev/null || stat -c%Y dist/main.js)

# --- 1. Migrasi bila revisi berubah ------------------------------------------
if [ "$(cat "$REV_FILE" 2>/dev/null)" != "$REV" ] || [ -f "$MIGRATE_REQUEST" ]; then
  if [ "$(cat "$REV_FAILED" 2>/dev/null)" = "$REV" ] && [ ! -f "$MIGRATE_REQUEST" ]; then
    : # revisi ini sudah gagal dimigrasi; tunggu revisi baru atau erp-migrate.request
  else
    {
      echo "=== $(date) migrasi (rev $REV) ==="
      echo "node: $(node -v 2>&1) di $(command -v node)"
      rm -f "$MIGRATE_REQUEST"
      stop_app
      if node --env-file="$ENV_FILE" dist/db/migrate.js; then
        echo "$REV" > "$REV_FILE"; rm -f "$REV_FAILED"
        echo "--- migrasi selesai ---"
      else
        echo "$REV" > "$REV_FAILED"
        echo "!!! migrasi GAGAL — API tidak dinyalakan dengan skema lama; perbaiki lalu buat ~/erp-migrate.request"
      fi
    } >> "$INSTALL_LOG" 2>&1
  fi
fi
[ "$(cat "$REV_FILE" 2>/dev/null)" = "$REV" ] || { echo "$(date) berhenti: migrasi rev $REV belum berhasil (lihat erp-install.log)" > "$STATUS"; exit 0; }

# --- 2. Semai data contoh -----------------------------------------------------
if [ -f "$SEED_REQUEST" ]; then
  {
    echo "=== $(date) menyemai data contoh ==="
    SEED_PW=$(sed -n '1p' "$SEED_REQUEST" | tr -d '\r\n')
    rm -f "$SEED_REQUEST"
    # NODE_ENV=development hanya untuk proses seed: konfigurasi menolak
    # SEED_PASSWORD di produksi (config.ts). Variabel lingkungan mengalahkan .env.
    NODE_ENV=development SEED_PASSWORD="$SEED_PW" node --env-file="$ENV_FILE" dist/seed/seed.js
    echo "--- seed kode keluar $? ---"
  } >> "$INSTALL_LOG" 2>&1
fi

# --- 3. Diminta menyala ulang? ------------------------------------------------
if [ -f "$RESTART_REQUEST" ]; then
  rm -f "$RESTART_REQUEST"; stop_app
  echo "=== $(date) diminta menyala ulang ===" >> "$LOG"
fi

# --- 4. Sudah berjalan? -------------------------------------------------------
if alive; then
  echo "$(date) hidup pid $(cat "$PIDFILE") rev $REV" > "$STATUS"
  exit 0
fi

# --- 5. Nyalakan --------------------------------------------------------------
echo "=== $(date) menyalakan API (rev $REV, node $(node -v 2>&1)) pada port $PORT ===" >> "$LOG"
nohup node --env-file="$ENV_FILE" dist/main.js >> "$LOG" 2>&1 0<&- &
echo $! > "$PIDFILE"
sleep 8
if alive; then
  CODE=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "http://127.0.0.1:$PORT/api/v1/health")
  echo "$(date) dinyalakan pid $(cat "$PIDFILE") rev $REV health=$CODE" > "$STATUS"
else
  echo "$(date) !!! API mati dalam 8 detik — lihat erp-app.log" > "$STATUS"
  rm -f "$PIDFILE"
fi
