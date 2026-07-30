# Deploy Bot Doa Pagi ke cPanel

Bot ini join Zoom lewat Web Client memakai Chromium headless, dijalankan Cron Job
setiap **Senin, Selasa, Jum'at 07.58 WIB**, dan bertahan ±35 menit dengan kamera
dan mic mati.

> Prasyarat: fitur **Setup Node.js App** (Node 18+), **Cron Jobs**, dan Terminal/SSH.
> Langkah 3 (check.js) akan memberi tahu dalam 1 menit apakah hosting Anda sanggup.

## 1. Upload

Zip folder `cpanel-bot` **tanpa** `node_modules`, upload lewat File Manager,
extract ke misalnya `/home/USERNAME/doa-pagi-bot`.

## 2. Buat aplikasi Node.js

cPanel → **Setup Node.js App** → Create Application:

- Node.js version: 18 atau lebih baru (pilih yang tertinggi)
- Application root: `doa-pagi-bot`
- Application URL: bebas (mis. `doa-pagi`)
- Application startup file: `app.js`

Klik **Create**, lalu klik **Run NPM Install** (agak lama, paket Chromium ±80 MB).
Catat perintah `source /home/USERNAME/nodevenv/...` yang tampil di halaman itu —
path `bin/node` di dalamnya dipakai untuk cron di langkah 6.

## 3. Cek apakah hosting sanggup

Buka Terminal cPanel:

```bash
source /home/USERNAME/nodevenv/doa-pagi-bot/20/bin/activate   # sesuaikan path
cd ~/doa-pagi-bot
node check.js
```

- `CHROMIUM OK` → lanjut. Output juga mencetak **baris cron yang benar** sesuai
  timezone server (jangan pakai jam WIB mentah kalau server bukan WIB!).
- `CHROMIUM GAGAL` → shared hosting Anda tidak mendukung browser headless.
  Solusinya pindah VPS, atau pakai kembali otomasi Mac.

## 4. Ganti nama tampilan

Edit `join.js` → `displayName: 'Gopal'` → ganti sesuai nama Anda di absensi.

## 5. Tes join sungguhan

```bash
FORCE=1 DURATION_MIN=2 node join.js
```

Lihat hasilnya di `bot.log` dan screenshot di folder `shots/` (download dan buka),
atau buka Application URL dari langkah 2 untuk melihat log lewat browser.

## 6. Pasang Cron Job

cPanel → **Cron Jobs** → Add New Cron Job. Contoh untuk server ber-timezone UTC
(pakai angka dari output `check.js`, dan sesuaikan `USERNAME` + versi node):

```
58 0 * * 1,2,5 /home/USERNAME/nodevenv/doa-pagi-bot/20/bin/node /home/USERNAME/doa-pagi-bot/join.js >> /home/USERNAME/doa-pagi-bot/cron.log 2>&1
```

`1,2,5` = Senin, Selasa, Jum'at. Ada pengaman tambahan di `join.js`: di luar
jendela 07.45–08.40 WIB bot menolak jalan, jadi salah setting jam tidak akan
membuat bot join tengah malam.

## Catatan penting

- **Jangan nyalakan dua otomasi sekaligus** (Mac + cPanel) — akan muncul dua
  peserta dengan nama sama.
- Proses harus hidup ±35 menit. Sebagian shared hosting membunuh proses
  panjang/berat (limit LVE). Kalau bot sering putus di tengah, itu sebabnya.
- Kalau undangan berganti link/passcode, update `pwd`, `passcode`, dan
  `meetingId` di `join.js`.
- Bot hadir "diam": kamera dan mic mati. Kalau moderator menyapa Anda, tidak ada
  yang menjawab — pertimbangkan tetap ikut dari HP saat bisa.
