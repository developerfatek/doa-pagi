// Preflight untuk cPanel: cek versi Node, waktu server vs WIB (untuk setting cron),
// memori, dan yang paling penting — apakah Chromium headless bisa jalan di hosting ini.
const os = require('os');
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');
const fs = require('fs');

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

(async () => {
  console.log('Node        :', process.version, `(${os.platform()}/${os.arch()})`);
  const now = new Date();
  console.log('Waktu server:', now.toString());
  console.log('Waktu WIB   :', now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }));

  // 07:58 WIB = 00:58 UTC → konversikan ke jam lokal server untuk baris cron.
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 58));
  console.log(
    `Cron untuk 07:58 WIB (Sen,Sel,Jum): ${t.getMinutes()} ${t.getHours()} * * 1,2,5`
  );
  console.log('RAM (info host, LVE bisa lebih kecil):',
    Math.round(os.freemem() / 1e6), 'MB bebas dari', Math.round(os.totalmem() / 1e6), 'MB');

  console.log('\nMenguji Chromium headless…');
  try {
    const browser = await puppeteer.launch({
      executablePath: await executablePath(),
      headless: true,
      args: process.platform === 'linux' ? chromium.args : [],
    });
    const page = await browser.newPage();
    await page.goto('https://zoom.us', { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log('CHROMIUM OK — judul halaman:', await page.title());
    await browser.close();
    console.log('\nLingkungan LOLOS. Lanjut ke langkah cron di DEPLOY.md.');
  } catch (e) {
    console.log('CHROMIUM GAGAL:', e.message);
    console.log('\n→ Hosting ini kemungkinan tidak mendukung browser headless.');
    console.log('  Solusi: pindah ke VPS, atau kembali pakai otomasi di Mac.');
    process.exit(1);
  }
})();
