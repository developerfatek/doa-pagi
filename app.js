// Endpoint status untuk Passenger (fitur "Setup Node.js App" di cPanel).
// Bot aslinya TIDAK jalan di sini — bot dijalankan lewat Cron Job (join.js).
// Buka URL aplikasi ini di browser untuk melihat log terakhir bot.
const http = require('http');
const fs = require('fs');
const path = require('path');

http
  .createServer((req, res) => {
    let tail = '(belum ada log)';
    try {
      tail = fs
        .readFileSync(path.join(__dirname, 'bot.log'), 'utf8')
        .split('\n')
        .slice(-30)
        .join('\n');
    } catch {}
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`doa-pagi bot aktif.\n\n=== Log terakhir ===\n${tail}\n`);
  })
  .listen(process.env.PORT || 3000);
