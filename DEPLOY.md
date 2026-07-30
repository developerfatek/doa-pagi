# Deploy Bot Doa Pagi ke Render

Bot join Zoom lewat Web Client (Chromium headless). **Server (app.js) terus
hidup** dengan penjadwal internal: setiap **Senin s.d. Jum'at 07.58 WIB**
otomatis menjalankan `join.js`, bertahan ±35 menit (kamera & mic mati), lalu
keluar. **Tidak perlu cron** — jadwal ada di dalam aplikasi.

## 1. Setting saat membuat Web Service

- Source: repo `developerfatek/doa-pagi`, Branch: `master`
- Language: `Node`
- Region: bebas (Oregon oke — jadwal dihitung dalam WIB, bukan jam server)
- Build Command: `npm install` (pakai `yarn` juga bisa)
- Start Command: `npm start` (pakai `yarn start` juga bisa)
- Instance Type: Free dulu. RAM free cuma 512 MB dan Chromium+Zoom lumayan
  rakus — kalau log menunjukkan crash/out-of-memory saat join, naik ke Starter.

## 2. Konfigurasi (.env / Environment)

Semua konfigurasi (meeting ID, passcode, nama tampilan, durasi, dll.) ada di
file `.env` — salin dari `.env.example` lalu sesuaikan. File `.env` sengaja
tidak ikut ke git, jadi di Render pilih salah satu:

- **Secret File** (paling praktis): menu Environment → Secret Files → buat
  file bernama `.env`, tempel isi `.env` Anda; atau
- isi variable satu per satu di menu **Environment**.

Variable dari dashboard Render selalu menang atas isi `.env`.

Saat mau uji coba saja: set `DOA_TEST_AT` = jam WIB dekat (mis. `15:30`) dan
`DURATION_MIN` = `2`. Simpan → Render otomatis restart → bot join pada jam
itu. Setelah sukses, **hapus kedua variable ini** lagi.

## 3. Anti-tidur: otomatis, tanpa cron/pinger eksternal

Render free menidurkan service setelah ±15 menit tanpa traffic masuk. App ini
mengatasinya sendiri: tiap 4 menit dia nge-ping URL publiknya (otomatis dari
`RENDER_EXTERNAL_URL` yang di-set Render) — ping itu terhitung traffic masuk,
jadi service tidak pernah idle. Tiap 5 menit ada heartbeat di menu Logs
sebagai bukti penjadwal hidup. Kuota free 750 jam/bulan cukup untuk satu
service hidup 24 jam nonstop.

Cadangan (opsional tapi disarankan): monitor gratis UptimeRobot ke URL service
tiap 5 menit — bukan untuk anti-tidur, tapi sebagai alarm kalau service down
betulan (self-ping tidak bisa membangunkan app yang sudah telanjur mati).

## 4. Ganti nama tampilan

Ubah `DISPLAY_NAME` di `.env` (atau di Environment/Secret File Render)
sesuai nama Anda di absensi — tidak perlu edit kode.

## 5. Memantau

- Buka URL service → halaman status: waktu WIB, jadwal, status join terakhir,
  40 baris log terakhir.
- Buka `/shots` → galeri screenshot yang diambil bot saat join (bukti hadir).
- Menu **Logs** di dashboard Render menampilkan log lengkap secara live.
- Disk Render bersifat sementara: `bot.log`, `shots/`, `locks/` terhapus tiap
  deploy/restart — log permanen ada di dashboard Render.

## Catatan penting

- Kalau undangan berganti link/passcode, update `pwd`, `passcode`, `meetingId`
  di `join.js`; ubah jadwal (hari/jam) di `SCHEDULE` dalam `app.js`.
- Bot hadir "diam": kamera dan mic mati. Kalau moderator menyapa Anda, tidak
  ada yang menjawab — pertimbangkan tetap ikut dari HP saat bisa.
