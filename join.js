// Bot hadir Doa Pagi — join Zoom lewat Web Client di Chromium headless.
// Dijalankan oleh Cron Job cPanel (lihat DEPLOY.md). Tes manual: FORCE=1 node join.js
const fs = require('fs');
const path = require('path');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// Muat konfigurasi dari .env (tanpa paket dotenv — bawaan Node 20.12+).
// Variable yang sudah ada di environment (mis. dari app.js/Render) menang.
try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile(path.join(__dirname, '.env'));
} catch {}

const CONFIG = {
  meetingId: process.env.ZOOM_MEETING_ID || '84694518277',
  // pwd terenkripsi yang menempel di link undangan — bukan passcode mentah.
  pwd: process.env.ZOOM_PWD || 'BbSVbahz7XkjxRzOEPcfEAaH6TARku.1',
  // passcode mentah, dipakai kalau web client tetap menampilkan kolom passcode.
  passcode: process.env.ZOOM_PASSCODE || 'doapagi',
  // PENTING: ganti sesuai nama Anda di daftar absensi.
  displayName: process.env.DISPLAY_NAME || 'Gopal',
  domain: process.env.ZOOM_DOMAIN || 'us06web.zoom.us',
  durationMin: parseInt(process.env.DURATION_MIN || '35', 10),
  // Jadwal pengaman dalam WIB — di luar ini bot menolak jalan (kecuali FORCE=1),
  // supaya salah setting timezone cron tidak membuat bot join di waktu aneh.
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  windowStart: 7 * 60 + 45,
  windowEnd: 8 * 60 + 40,
};

const SHOTS_DIR = path.join(__dirname, 'shots');
const LOG_FILE = path.join(__dirname, 'bot.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function wibNow() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return { day: get('weekday'), minutes: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10) };
}

function inSchedule() {
  const { day, minutes } = wibNow();
  return CONFIG.days.includes(day) && minutes >= CONFIG.windowStart && minutes <= CONFIG.windowEnd;
}

async function shot(page, name) {
  try {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({ path: path.join(SHOTS_DIR, `${stamp}-${name}.png`) });
    const old = fs.readdirSync(SHOTS_DIR).sort().slice(0, -20);
    for (const f of old) fs.unlinkSync(path.join(SHOTS_DIR, f));
  } catch (e) {
    log(`(screenshot ${name} gagal: ${e.message})`);
  }
}

// sparticuz/chromium hanya untuk Linux; di macOS (untuk tes lokal) pakai Chrome sistem.
async function executablePath() {
  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
    for (const p of candidates) if (fs.existsSync(p)) return p;
  }
  return chromium.executablePath();
}

async function clickByText(page, texts) {
  return page.evaluate((wanted) => {
    const els = [...document.querySelectorAll('button, a[role="button"], [role="button"]')];
    for (const el of els) {
      const t = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (wanted.some((w) => t === w || t.startsWith(w))) {
        el.click();
        return t;
      }
    }
    return null;
  }, texts.map((t) => t.toLowerCase()));
}

async function bodyText(page) {
  try { return await page.evaluate(() => document.body.innerText || ''); } catch { return ''; }
}

// Matikan kamera & mute mic — dipanggil di halaman preview DAN setelah masuk meeting.
// Tanpa ini bot tampil dengan pola video palsu Chrome (lingkaran hijau) dan bunyi bip.
async function setMediaOff(page) {
  try {
    const acted = await page.evaluate(() => {
      const out = [];
      for (const b of document.querySelectorAll('button')) {
        const label = `${b.getAttribute('aria-label') || ''} ${b.innerText || ''}`.toLowerCase().trim();
        if (/stop video|stop my video|turn off camera/.test(label)) { b.click(); out.push('kamera-off'); }
        else if (/\bmute\b/.test(label) && !/\bunmute\b/.test(label)) { b.click(); out.push('mic-mute'); }
      }
      return out;
    });
    if (acted.length) log(`Media dimatikan: ${acted.join(', ')}`);
  } catch {}
}

(async () => {
  if (!process.env.FORCE && !inSchedule()) {
    const { day, minutes } = wibNow();
    log(`Di luar jadwal (WIB sekarang: ${day} ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}) — keluar. Pakai FORCE=1 untuk tes.`);
    return;
  }

  log(`Mulai: join meeting ${CONFIG.meetingId} sebagai "${CONFIG.displayName}" selama ~${CONFIG.durationMin} menit.`);
  const browser = await puppeteer.launch({
    executablePath: await executablePath(),
    headless: true,
    defaultViewport: { width: 1280, height: 720 },
    args: [
      ...(process.platform === 'linux' ? chromium.args : []),
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--lang=en-US',
    ],
  });

  try {
    const page = await browser.newPage();
    // UA headless bawaan sering ditolak; samarkan sebagai Chrome biasa.
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    const url = `https://${CONFIG.domain}/wc/join/${CONFIG.meetingId}?pwd=${encodeURIComponent(CONFIG.pwd)}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await shot(page, '01-load');

    // Banner cookie (OneTrust) dan dialog persetujuan ToS kalau muncul.
    for (const sel of ['#onetrust-accept-btn-handler', '#wc_agree1']) {
      try {
        const btn = await page.waitForSelector(sel, { timeout: 4000 });
        await btn.click();
        log(`Klik dialog awal: ${sel}`);
      } catch {}
    }

    // Isi nama (dan passcode bila kolomnya ada).
    const nameSel = '#input-for-name, input[placeholder*="name" i], input[aria-label*="name" i]';
    await page.waitForSelector(nameSel, { visible: true, timeout: 60000 });
    await page.click(nameSel, { clickCount: 3 });
    await page.type(nameSel, CONFIG.displayName, { delay: 40 });

    const pwdSel = '#input-for-pwd, input[type="password"], input[placeholder*="passcode" i]';
    const pwdField = await page.$(pwdSel);
    if (pwdField) {
      await pwdField.type(CONFIG.passcode, { delay: 40 });
      log('Kolom passcode terdeteksi — diisi.');
    }
    await setMediaOff(page);
    await shot(page, '02-form');

    const clicked =
      (await page.$('.preview-join-button').then((b) => b && b.click().then(() => 'preview-join-button'))) ||
      (await clickByText(page, ['join', 'gabung']));
    log(`Klik tombol join: ${clicked || 'TIDAK KETEMU'}`);
    if (!clicked) throw new Error('Tombol Join tidak ditemukan — cek screenshot di folder shots/');

    // Tunggu sampai benar-benar di dalam meeting, atau di ruang tunggu host.
    await page
      .waitForFunction(
        () => /join audio|leave|waiting for the host|host will let you in|meeting passcode/i.test(document.body.innerText),
        { timeout: 120000 }
      )
      .catch(() => {});
    await shot(page, '03-after-join');

    const text = await bodyText(page);
    if (/waiting for the host/i.test(text)) log('Meeting belum dimulai host — menunggu di halaman.');
    else if (/host will let you in/i.test(text)) log('Masuk waiting room — menunggu diterima host.');
    else if (/join audio|leave/i.test(text)) log('BERHASIL masuk meeting.');
    else log('Status belum jelas — lihat screenshot 03-after-join.');

    // Pastikan lagi kamera/mic mati setelah benar-benar berada di dalam meeting.
    await setMediaOff(page);

    // Bertahan di meeting sampai durasi habis, sambil memantau status.
    const endAt = Date.now() + CONFIG.durationMin * 60 * 1000;
    let lastShot = 0;
    let mediaSweeps = 0;
    while (Date.now() < endAt) {
      await new Promise((r) => setTimeout(r, 30000));
      if (mediaSweeps < 2) { await setMediaOff(page); mediaSweeps++; }
      const t = await bodyText(page);
      if (/meeting has been ended|has ended|removed you|you have been removed/i.test(t)) {
        log('Meeting sudah diakhiri host — selesai lebih awal.');
        break;
      }
      if (Date.now() - lastShot > 5 * 60 * 1000) {
        await shot(page, 'presence');
        lastShot = Date.now();
      }
    }

    log('Durasi selesai — keluar dari meeting.');
    await shot(page, '04-done');
  } finally {
    await browser.close().catch(() => {});
  }
  log('Selesai.');
})().catch((e) => {
  log(`ERROR: ${e.message}`);
  process.exit(1);
});
