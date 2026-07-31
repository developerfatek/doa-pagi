// Aplikasi utama — server terus hidup (Render / VPS / cPanel Passenger):
// menyajikan halaman status DAN menjalankan penjadwal internal yang men-spawn
// join.js setiap Senin s.d. Jum'at pukul 07.58 WIB. Tidak perlu cron.
//
// Catatan Render (free tier): instance tidur setelah ±15 menit tanpa traffic —
// diatasi dengan self-ping ke RENDER_EXTERNAL_URL (lihat blok anti-tidur).
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// Muat konfigurasi dari .env (tanpa paket dotenv — bawaan Node 20.12+).
// Variable yang sudah ada di environment (mis. dashboard Render) menang.
try {
  if (typeof process.loadEnvFile === "function")
    process.loadEnvFile(path.join(__dirname, ".env"));
} catch {}

const SCHEDULE = {
  days: ["Mon", "Tue", "Wed", "Thu", "Fri"], // hari Doa Pagi
  hour: 7,
  minute: 58, // jam mulai join, WIB
  lateMinutes: 17, // kalau app sempat mati, masih boleh mulai sampai 08:15
};

// Uji coba: DOA_TEST_AT="HH:MM" (WIB) memicu join pada jam itu di hari apa pun,
// dengan FORCE=1 ke join.js supaya lolos pengaman jadwal internalnya.
const TEST_AT = process.env.DOA_TEST_AT || null;

const LOG_FILE = path.join(__dirname, "bot.log");
const LOCK_DIR = path.join(__dirname, "locks");
const SHOTS_DIR = path.join(__dirname, "shots");
let joinProc = null;
let lastStatus = "belum ada aktivitas sejak server start";

function log(msg) {
  const line = `[${new Date().toISOString()}] [app] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {}
}

function wib() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t) => parts.find((p) => p.type === t).value;
  return {
    day: g("weekday"),
    dateKey: `${g("year")}-${g("month")}-${g("day")}`,
    minutes: (parseInt(g("hour"), 10) % 24) * 60 + parseInt(g("minute"), 10),
    hhmm: `${g("hour")}:${g("minute")}`,
  };
}

function startMinutes() {
  if (TEST_AT) {
    const [h, m] = TEST_AT.split(":").map(Number);
    return h * 60 + m;
  }
  return SCHEDULE.hour * 60 + SCHEDULE.minute;
}

function shouldStart(w) {
  if (joinProc) return false;
  if (!TEST_AT && !SCHEDULE.days.includes(w.day)) return false;
  return (
    w.minutes >= startMinutes() &&
    w.minutes <= startMinutes() + SCHEDULE.lateMinutes
  );
}

// Lock per-hari lewat file (flag wx = atomik): kalau platform menjalankan
// beberapa instance app sekaligus, hanya satu yang men-spawn join.
function acquireLock(w) {
  fs.mkdirSync(LOCK_DIR, { recursive: true });
  const cutoff = Date.now() - 14 * 864e5;
  for (const f of fs.readdirSync(LOCK_DIR)) {
    const p = path.join(LOCK_DIR, f);
    try {
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    } catch {}
  }
  const name = TEST_AT
    ? `test-${w.dateKey}-${TEST_AT.replace(":", "")}.lock`
    : `${w.dateKey}.lock`;
  const lockPath = path.join(LOCK_DIR, name);
  try {
    fs.writeFileSync(lockPath, new Date().toISOString(), { flag: "wx" });
    return lockPath;
  } catch {
    return null;
  }
}

function startJoin(w) {
  const lock = acquireLock(w);
  if (!lock) return;
  log(`Jadwal tiba (${w.day} ${w.hhmm} WIB) — menjalankan join.js`);
  lastStatus = `join dimulai ${w.dateKey} ${w.hhmm} WIB`;

  const env = { ...process.env };
  if (TEST_AT) env.FORCE = "1";
  joinProc = spawn(process.execPath, [path.join(__dirname, "join.js")], {
    env,
    stdio: ["ignore", "ignore", "pipe"],
  });
  let errBuf = "";
  joinProc.stderr.on("data", (d) => {
    errBuf = (errBuf + d).slice(-1000);
  });
  joinProc.on("exit", (code) => {
    joinProc = null;
    if (code === 0) {
      lastStatus = `join terakhir selesai normal (${w.dateKey})`;
      log("join.js selesai (exit 0).");
    } else {
      lastStatus = `join GAGAL (exit ${code}) ${w.dateKey}`;
      log(`join.js GAGAL (exit ${code}). ${errBuf.trim().slice(-300)}`);
      const now = wib();
      if (
        now.dateKey === w.dateKey &&
        now.minutes <= startMinutes() + SCHEDULE.lateMinutes
      ) {
        try {
          fs.unlinkSync(lock);
          log("Lock dihapus — dicoba lagi di tick berikutnya.");
        } catch {}
      }
    }
  });
}

setInterval(() => {
  const w = wib();
  if (shouldStart(w)) startJoin(w);
}, 20000);

// Anti-tidur tanpa cron/pinger eksternal: ping URL publik sendiri tiap
// beberapa menit. Ping ini lewat proxy Render sehingga terhitung traffic
// masuk — free tier tidak menidurkan service selama ini berjalan.
// Render otomatis mengisi RENDER_EXTERNAL_URL; APP_URL hanya untuk override.
const SELF_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || null;
const PING_MIN = parseFloat(process.env.PING_MINUTES || "4");
const HEARTBEAT_MIN = parseFloat(process.env.HEARTBEAT_MINUTES || "5");
let lastPing = "belum ada";
if (SELF_URL && typeof fetch === "function") {
  setInterval(
    () => {
      fetch(SELF_URL)
        .then((r) => {
          lastPing = `${r.ok ? "ok" : `HTTP ${r.status}`} ${wib().hhmm} WIB`;
        })
        .catch((e) => {
          lastPing = `gagal (${e.message}) ${wib().hhmm} WIB`;
        });
    },
    PING_MIN * 60 * 1000,
  );
}

// Heartbeat ke stdout (tampil di menu Logs Render) — bukti penjadwal hidup.
// Sengaja tidak ditulis ke bot.log supaya halaman status tetap menampilkan
// riwayat join, bukan tumpukan heartbeat.
setInterval(
  () => {
    const w = wib();
    console.log(
      `[${new Date().toISOString()}] [app] heartbeat — WIB ${w.day} ${w.hhmm}, ` +
        `status: ${joinProc ? "join berjalan" : lastStatus}, ` +
        `self-ping: ${SELF_URL ? lastPing : "NONAKTIF (RENDER_EXTERNAL_URL/APP_URL tidak ada)"}`,
    );
  },
  HEARTBEAT_MIN * 60 * 1000,
);

// Galeri screenshot bot: /shots (daftar) dan /shots/<nama>.png|.jpg (gambar) —
// berguna di Render karena tidak ada file manager.
function serveShots(req, res) {
  const name = decodeURIComponent(
    (req.url || "").replace(/^\/shots\/?/, "").split("?")[0],
  );
  if (!name) {
    let files = [];
    try {
      files = fs.readdirSync(SHOTS_DIR).sort().reverse();
    } catch {}
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      "<h3>Screenshot bot (terbaru di atas)</h3>" +
        (files.map((f) => `<p><a href="/shots/${f}">${f}</a></p>`).join("") ||
          "<p>(belum ada)</p>"),
    );
    return;
  }
  if (!/^[\w.-]+\.(png|jpe?g)$/.test(name)) {
    res.writeHead(400);
    res.end("nama file tidak valid");
    return;
  }
  try {
    const buf = fs.readFileSync(path.join(SHOTS_DIR, name));
    res.writeHead(200, {
      "Content-Type": name.endsWith(".png") ? "image/png" : "image/jpeg",
    });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("tidak ada");
  }
}

http
  .createServer((req, res) => {
    if ((req.url || "").startsWith("/shots")) return serveShots(req, res);
    const w = wib();
    let tail = "(belum ada log)";
    try {
      tail = fs
        .readFileSync(LOG_FILE, "utf8")
        .split("\n")
        .slice(-40)
        .join("\n");
    } catch {}
    const jam = `${String(SCHEDULE.hour).padStart(2, "0")}:${String(SCHEDULE.minute).padStart(2, "0")}`;
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      [
        "Doa Pagi 🤲 ",
        "",
        `Waktu WIB : ${w.day}, ${w.dateKey} ${w.hhmm}`,
        `Jadwal    : ${SCHEDULE.days.join(", ")} pukul ${jam} WIB`,
        `Mode uji  : ${TEST_AT ? `DOA_TEST_AT=${TEST_AT}` : "tidak aktif"}`,
        `Status    : ${joinProc ? "SEDANG join / di dalam meeting" : lastStatus}`,
        `Anti-tidur: ${SELF_URL ? `self-ping tiap ${PING_MIN} menit → ${SELF_URL} (terakhir: ${lastPing})` : "NONAKTIF — set APP_URL atau deploy di Render"}`,
        `Screenshot: buka /shots`,
        "",
        "=== Log terakhir ===",
        tail,
        "",
      ].join("\n"),
    );
  })
  .listen(process.env.PORT || 3000);

log(
  `app.js start — penjadwal aktif (${SCHEDULE.days.join(",")} 07:58 WIB${TEST_AT ? `, mode uji ${TEST_AT}` : ""}).`,
);
