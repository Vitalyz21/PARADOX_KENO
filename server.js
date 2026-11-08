const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const PUBLIC = path.join(__dirname, "public");
const START_BALANCE = 1000;
const PAYOUTS = {
  1: {0: 0, 1: 3.5},
  2: {0: 0, 1: 1.0, 2: 12},
  3: {0: 0, 1: 0, 2: 2.5, 3: 35},
  4: {0: 0, 1: 0, 2: 1.2, 3: 8, 4: 80},
  5: {0: 0, 1: 0, 2: 0.5, 3: 3, 4: 15, 5: 150},
  6: {0: 0, 1: 0, 2: 0, 3: 2, 4: 8, 5: 35, 6: 250},
  7: {0: 0, 1: 0, 2: 0, 3: 1.5, 4: 5, 5: 20, 6: 80, 7: 400},
  8: {0: 0, 1: 0, 2: 0, 3: 1, 4: 4, 5: 12, 6: 50, 7: 180, 8: 600},
  9: {0: 0, 1: 0, 2: 0, 3: 0.8, 4: 3, 5: 8, 6: 25, 7: 90, 8: 300, 9: 800},
  10:{0: 0, 1: 0, 2: 0, 3: 0.5, 4: 2, 5: 5, 6: 15, 7: 50, 8: 150, 9: 400, 10: 1000}
};

let balance = START_BALANCE;
let nonce = 0;
let clientSeed = "paradox-player";
let serverSeed = crypto.randomBytes(32).toString("hex");
let history = [];

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
function randomBytesFromHmac(key, message) {
  return crypto.createHmac("sha256", key).update(message).digest();
}
function fairShuffle(count, seed, client, round) {
  const values = Array.from({length: count}, (_, i) => i + 1);
  let cursor = 0, block = 0, bytes = Buffer.alloc(0);
  function nextUint32() {
    if (cursor + 4 > bytes.length) {
      bytes = randomBytesFromHmac(seed, `${client}:${round}:${block++}`);
      cursor = 0;
    }
    const n = bytes.readUInt32BE(cursor);
    cursor += 4;
    return n;
  }
  for (let i = values.length - 1; i > 0; i--) {
    const j = nextUint32() % (i + 1);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
function publicState() {
  return {
    balance, nonce, clientSeed,
    serverSeedHash: sha256(serverSeed),
    history: history.slice(0, 12),
    payoutTable: PAYOUTS
  };
}
function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, {"Content-Type": type, "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"});
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 1e6) reject(new Error("Body too large")); });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}
const mime = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml"};

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, "");
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/state") return send(res, 200, publicState());

  if (req.method === "POST" && url.pathname === "/api/play") {
    try {
      const body = await readBody(req);
      const picks = [...new Set((body.picks || []).map(Number))].sort((a,b)=>a-b);
      const bet = Number(body.bet);
      if (picks.length < 1 || picks.length > 10 || picks.some(n => !Number.isInteger(n) || n < 1 || n > 40))
        return send(res, 400, {error:"Выберите от 1 до 10 уникальных чисел от 1 до 40."});
      if (!Number.isFinite(bet) || bet < 0.1 || bet > 1000)
        return send(res, 400, {error:"Ставка должна быть от 0.10 до 1000.00 виртуальных кредитов."});
      if (bet > balance) return send(res, 400, {error:"Недостаточно виртуальных кредитов."});

      const round = nonce++;
      const drawn = fairShuffle(40, serverSeed, clientSeed, round).slice(0, 10).sort((a,b)=>a-b);
      const hits = picks.filter(n => drawn.includes(n)).length;
      const multiplier = Number((PAYOUTS[picks.length][hits] || 0));
      const payout = Number((bet * multiplier).toFixed(2));
      balance = Number((balance - bet + payout).toFixed(2));
      const result = {
        id: round + 1, picks, drawn, hits, bet,
        multiplier, payout, net: Number((payout - bet).toFixed(2)),
        serverSeedHash: sha256(serverSeed), clientSeed, nonce: round
      };
      history.unshift(result);
      history = history.slice(0, 30);
      return send(res, 200, {...result, ...publicState()});
    } catch (e) {
      return send(res, 400, {error:e.message || "Не удалось провести раунд."});
    }
  }

  if (req.method === "POST" && url.pathname === "/api/client-seed") {
    try {
      const body = await readBody(req);
      const seed = String(body.clientSeed || "").trim().slice(0, 64);
      if (!seed) return send(res, 400, {error:"Client seed не может быть пустым."});
      clientSeed = seed;
      return send(res, 200, publicState());
    } catch (e) { return send(res, 400, {error:e.message}); }
  }

  if (req.method === "POST" && url.pathname === "/api/reset-demo") {
    balance = START_BALANCE;
    return send(res, 200, publicState());
  }

  if (req.method === "GET") {
    const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = path.resolve(PUBLIC, requested);
    if (!file.startsWith(PUBLIC + path.sep) && file !== path.join(PUBLIC, "index.html")) return send(res, 403, "Forbidden", "text/plain");
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, "Not found", "text/plain; charset=utf-8");
      send(res, 200, data, mime[path.extname(file)] || "application/octet-stream");
    });
    return;
  }
  send(res, 404, {error:"Not found"});
});

server.listen(PORT, HOST, () => console.log(`PARADOX KENO listening on ${HOST}:${PORT}`));
