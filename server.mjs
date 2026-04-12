/**
 * Статика сайта + API админки (сохранение JSON в site/data).
 * Запуск из корня репозитория: npm start
 * Секреты и чувствительные настройки читаются из переменных окружения.
 */
import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import Database from "better-sqlite3";

const require = createRequire(import.meta.url);
const busboy = require("busboy");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "site", "data");
const CALC_FILE = path.join(DATA_DIR, "calculator.json");
const PORTFOLIO_FILE = path.join(DATA_DIR, "portfolio.json");
const DB_DIR = path.join(ROOT, "data");
const PORTFOLIO_UPLOAD_DIR = path.join(ROOT, "site", "uploads", "portfolio");
const PORTFOLIO_UPLOAD_URL_PREFIX = "/site/uploads/portfolio/";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const src = fs.readFileSync(filePath, "utf8");
  src.split(/\r?\n/).forEach((line) => {
    const raw = line.trim();
    if (!raw || raw.startsWith("#")) return;
    const idx = raw.indexOf("=");
    if (idx < 1) return;
    const key = raw.slice(0, idx).trim();
    let val = raw.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  });
}

loadEnvFile(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "0.0.0.0";
const NODE_ENV = process.env.NODE_ENV || "development";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
const ADMIN_PASSWORD_RAW = process.env.ADMIN_PASSWORD;
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR, "indigo.db");

if (!ADMIN_PASSWORD_RAW || !String(ADMIN_PASSWORD_RAW).trim()) {
  console.error("[FATAL] ADMIN_PASSWORD is required. Set it in environment (.env for local use).");
  process.exit(1);
}

const ADMIN_PASSWORD = String(ADMIN_PASSWORD_RAW).trim();

const UPLOAD_MAX_IMAGE_MB = Math.min(
  512,
  Math.max(1, Number(process.env.UPLOAD_MAX_IMAGE_MB) || 25)
);
const UPLOAD_MAX_VIDEO_MB = Math.min(
  2048,
  Math.max(1, Number(process.env.UPLOAD_MAX_VIDEO_MB) || 200)
);
const UPLOAD_MAX_IMAGE_BYTES = UPLOAD_MAX_IMAGE_MB * 1024 * 1024;
const UPLOAD_MAX_VIDEO_BYTES = UPLOAD_MAX_VIDEO_MB * 1024 * 1024;
const UPLOAD_BOY_MAX_BYTES = Math.max(UPLOAD_MAX_IMAGE_BYTES, UPLOAD_MAX_VIDEO_BYTES);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const tokens = new Set();

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
if (!fs.existsSync(PORTFOLIO_UPLOAD_DIR)) {
  fs.mkdirSync(PORTFOLIO_UPLOAD_DIR, { recursive: true });
}
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

function readJsonFileSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_) {
    return null;
  }
}

function getConfig(key) {
  const row = db.prepare("SELECT payload FROM app_config WHERE key = ?").get(key);
  if (!row) return null;
  return JSON.parse(row.payload);
}

function saveConfig(key, data) {
  const payload = JSON.stringify(data, null, 2);
  db.prepare(
    `
    INSERT INTO app_config (key, payload, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      payload = excluded.payload,
      updated_at = CURRENT_TIMESTAMP
  `
  ).run(key, payload);
}

function bootstrapConfigFromFiles() {
  if (!getConfig("calculator")) {
    const calc = readJsonFileSafe(CALC_FILE);
    if (calc) saveConfig("calculator", calc);
  }
  if (!getConfig("portfolio")) {
    const pf = readJsonFileSafe(PORTFOLIO_FILE);
    if (pf) saveConfig("portfolio", pf);
  }
}

bootstrapConfigFromFiles();

if (NODE_ENV === "production" && ADMIN_PASSWORD.toLowerCase() === "admin") {
  console.error("[FATAL] ADMIN_PASSWORD cannot be 'admin' in production.");
  process.exit(1);
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function getToken(req) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice(7).trim();
}

function requireAuth(req, res) {
  const t = getToken(req);
  if (!t || !tokens.has(t)) {
    res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "unauthorized" }));
    return null;
  }
  return t;
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj, null, 2));
}

function commonHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
  };
}

function buildCorsHeaders(req) {
  if (!CORS_ORIGIN) {
    if (NODE_ENV === "production") return {};
    return { "Access-Control-Allow-Origin": "*" };
  }
  const origin = req.headers.origin;
  if (origin && origin === CORS_ORIGIN) {
    return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }
  return { "Access-Control-Allow-Origin": CORS_ORIGIN, Vary: "Origin" };
}

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const rel = decoded.replace(/^\/+/, "");
  const full = path.normalize(path.join(root, rel));
  if (!full.startsWith(path.normalize(root + path.sep)) && full !== path.normalize(root)) {
    return null;
  }
  return full;
}

function serveStatic(filePath, res) {
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, commonHeaders(type));
    fs.createReadStream(filePath).pipe(res);
  });
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function normPath(p) {
  const s = (p || "/").split("?")[0];
  return s.replace(/\/+$/, "") || "/";
}

const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VID_EXT = new Set([".mp4", ".webm"]);

function portfolioUploadKindFromField(v) {
  return v === "video" ? "video" : "image";
}

function handlePortfolioUpload(req, res, cors) {
  if (!requireAuth(req, res)) return;

  let kind = "image";
  let savedUrl = null;
  let rejectReason = null;
  let filePromise = Promise.resolve();

  const bb = busboy({
    headers: req.headers,
    limits: {
      fileSize: UPLOAD_BOY_MAX_BYTES,
      files: 1,
      fields: 8,
      parts: 12,
    },
  });

  bb.on("field", (name, val) => {
    if (name === "kind") kind = portfolioUploadKindFromField(String(val || "").trim());
  });

  bb.on("file", (name, file, info) => {
    if (name !== "file") {
      file.resume();
      return;
    }

    const ext = path.extname(info.filename || "").toLowerCase();
    const allowed = kind === "video" ? VID_EXT : IMG_EXT;
    if (!allowed.has(ext)) {
      rejectReason = { status: 400, err: "invalid_type" };
      file.resume();
      return;
    }

    const maxBytes = kind === "video" ? UPLOAD_MAX_VIDEO_BYTES : UPLOAD_MAX_IMAGE_BYTES;
    const fname = crypto.randomBytes(18).toString("hex") + ext;
    const dest = path.join(PORTFOLIO_UPLOAD_DIR, fname);

    filePromise = new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(dest);
      let hitLimit = false;
      file.once("limit", () => {
        hitLimit = true;
        try {
          ws.destroy();
        } catch (_) {}
      });
      ws.on("error", reject);
      file.on("error", reject);
      ws.on("finish", () => {
        if (hitLimit) {
          try {
            fs.unlinkSync(dest);
          } catch (_) {}
          rejectReason = rejectReason || { status: 413, err: "too_large" };
          resolve();
          return;
        }
        if (rejectReason) {
          try {
            fs.unlinkSync(dest);
          } catch (_) {}
          resolve();
          return;
        }
        try {
          const st = fs.statSync(dest);
          if (st.size > maxBytes) {
            fs.unlinkSync(dest);
            rejectReason = { status: 413, err: "too_large" };
            resolve();
            return;
          }
        } catch (_) {
          rejectReason = { status: 500, err: "stat_failed" };
          resolve();
          return;
        }
        savedUrl = PORTFOLIO_UPLOAD_URL_PREFIX + fname;
        resolve();
      });
      file.pipe(ws);
    });
  });

  bb.on("error", () => {
    rejectReason = rejectReason || { status: 400, err: "parse_error" };
  });

  bb.on("finish", async () => {
    const headers = { ...commonHeaders("application/json; charset=utf-8"), ...cors };
    try {
      await filePromise;
    } catch (_) {
      rejectReason = rejectReason || { status: 500, err: "write_failed" };
    }
    if (rejectReason) {
      res.writeHead(rejectReason.status, headers);
      res.end(JSON.stringify({ error: rejectReason.err }));
      return;
    }
    if (!savedUrl) {
      res.writeHead(400, headers);
      res.end(JSON.stringify({ error: "no_file" }));
      return;
    }
    res.writeHead(200, headers);
    res.end(JSON.stringify({ url: savedUrl }));
  });

  req.pipe(bb);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1`);
  const pathname = normPath(url.pathname);

  if (req.method === "OPTIONS") {
    const corsHeaders = buildCorsHeaders(req);
    res.writeHead(204, {
      ...corsHeaders,
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const cors = buildCorsHeaders(req);

  try {
    if (req.method === "GET" && pathname === "/healthz") {
      sendJson(res, 200, {
        ok: true,
        status: "healthy",
        env: NODE_ENV,
        uptimeSec: Math.round(process.uptime()),
        dbPath: DB_PATH,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/site/data/calculator.json") {
      const data = getConfig("calculator");
      if (!data) {
        sendJson(res, 404, { error: "missing_calculator" });
        return;
      }
      res.writeHead(200, { ...commonHeaders("application/json; charset=utf-8"), ...cors });
      res.end(JSON.stringify(data, null, 2));
      return;
    }

    if (req.method === "GET" && pathname === "/site/data/portfolio.json") {
      const data = getConfig("portfolio");
      if (!data) {
        sendJson(res, 404, { error: "missing_portfolio" });
        return;
      }
      res.writeHead(200, { ...commonHeaders("application/json; charset=utf-8"), ...cors });
      res.end(JSON.stringify(data, null, 2));
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const password = body && String(body.password).trim();
      const expected = String(ADMIN_PASSWORD).trim();
      if (password !== expected) {
        res.writeHead(401, { ...commonHeaders("application/json; charset=utf-8"), ...cors });
        res.end(JSON.stringify({ error: "invalid_password" }));
        return;
      }
      const token = crypto.randomBytes(32).toString("hex");
      tokens.add(token);
      res.writeHead(200, { ...commonHeaders("application/json; charset=utf-8"), ...cors });
      res.end(JSON.stringify({ token }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      const t = getToken(req);
      if (t) tokens.delete(t);
      res.writeHead(200, { ...commonHeaders("application/json; charset=utf-8"), ...cors });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/admin/upload-portfolio") {
      handlePortfolioUpload(req, res, cors);
      return;
    }

    if (pathname === "/api/admin/calculator") {
      if (req.method === "GET") {
        const data = getConfig("calculator");
        if (!data) {
          sendJson(res, 404, { error: "missing_file" });
          return;
        }
        res.writeHead(200, { ...commonHeaders("application/json; charset=utf-8"), ...cors });
        res.end(JSON.stringify(data, null, 2));
        return;
      }
      if (req.method === "PUT") {
        if (!requireAuth(req, res)) return;
        const body = await parseBody(req);
        if (!body || !Array.isArray(body.types) || body.types.length < 1) {
          sendJson(res, 400, { error: "invalid_shape" });
          return;
        }
        const badType = body.types.some(
          (t) => !t || typeof t !== "object" || typeof t.addons !== "object" || t.addons === null
        );
        if (badType) {
          sendJson(res, 400, { error: "invalid_shape" });
          return;
        }
        if (typeof body.addons !== "object" || body.addons === null) {
          body.addons = {};
        }
        saveConfig("calculator", body);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (pathname === "/api/admin/portfolio") {
      if (req.method === "GET") {
        const data = getConfig("portfolio");
        if (!data) {
          sendJson(res, 404, { error: "missing_file" });
          return;
        }
        res.writeHead(200, { ...commonHeaders("application/json; charset=utf-8"), ...cors });
        res.end(JSON.stringify(data, null, 2));
        return;
      }
      if (req.method === "PUT") {
        if (!requireAuth(req, res)) return;
        const body = await parseBody(req);
        if (!body || typeof body.cases !== "object" || !Array.isArray(body.order)) {
          sendJson(res, 400, { error: "invalid_shape" });
          return;
        }
        saveConfig("portfolio", body);
        sendJson(res, 200, { ok: true });
        return;
      }
    }
  } catch (e) {
    res.writeHead(400, { ...commonHeaders("application/json; charset=utf-8"), ...cors });
    res.end(JSON.stringify({ error: String(e.message || e) }));
    return;
  }

  let staticPath = url.pathname;
  if (staticPath === "/" || staticPath === "") staticPath = "/site/index.html";

  const filePath = safeJoin(ROOT, staticPath);
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    const idx = path.join(filePath, "index.html");
    if (fs.existsSync(idx)) return serveStatic(idx, res);
  }

  serveStatic(filePath, res);
});

server.listen(PORT, HOST, () => {
  console.log(`INDIGO site + admin API → http://127.0.0.1:${PORT}/site/index.html`);
  console.log(`Админка → http://127.0.0.1:${PORT}/site/admin/`);
  console.log(`Healthcheck → http://127.0.0.1:${PORT}/healthz`);
  console.log(`HOST=${HOST} NODE_ENV=${NODE_ENV}`);
  console.log(`DB_PATH=${DB_PATH}`);
  console.log(`CORS_ORIGIN=${CORS_ORIGIN || "(auto: * in dev, disabled in production)"}`);
  console.log("ADMIN_PASSWORD=(from env)");
});
