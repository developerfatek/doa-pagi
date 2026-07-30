# Deploy Bot Doa Pagi ke Render

Bot join Zoom lewat Web Client (Chromium headless). **Server (app.js) terus
hidup** dengan penjadwal internal: setiap **Senin, Selasa, Jum'at 07.58 WIB**
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

## 2. Environment variables (menu Environment)

- `APP_URL` = URL service Anda, mis. `https://doa-pagi.onrender.com`
  (dipakai app untuk ping dirinya sendiri; isi setelah deploy pertama).
- Saat mau uji coba saja: `DOA_TEST_AT` = jam WIB dekat (mis. `15:30`) dan
  `DURATION_MIN` = `2`. Simpan → Render otomatis restart → bot join pada jam
  itu. Setelah sukses, **hapus kedua variable ini** lagi.

## 3. WAJIB: jangan biarkan service tidur (free tier)

Render free menidurkan service setelah ±15 menit tanpa traffic — kalau tidur,
penjadwal ikut mati dan bot tidak akan join. Buat monitor gratis di
**UptimeRobot** (atau cron-job.org): HTTP ping ke URL service tiap 5 menit.
Kuota free 750 jam/bulan cukup untuk satu service hidup 24 jam nonstop.

## 4. Ganti nama tampilan

Edit `join.js` → `displayName: 'Gopal'` → sesuaikan nama Anda di absensi,
commit & push (Render auto-deploy dari branch master).

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
