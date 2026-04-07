/**
 * Статика сайта + API админки (сохранение JSON в site/data).
 * Запуск из корня репозитория: npm start
 * Пароль: переменная ADMIN_PASSWORD (по умолчанию admin — смените в проде).
 */
import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "site", "data");
const CALC_FILE = path.join(DATA_DIR, "calculator.json");
const PORTFOLIO_FILE = path.join(DATA_DIR, "portfolio.json");

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const NODE_ENV = process.env.NODE_ENV || "development";

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
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const tokens = new Set();

if (NODE_ENV === "production" && String(ADMIN_PASSWORD).trim() === "admin") {
  console.warn("[WARN] ADMIN_PASSWORD uses default value 'admin'. Set a strong password in production.");
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1`);
  const pathname = normPath(url.pathname);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    res.end();
    return;
  }

  const cors = { "Access-Control-Allow-Origin": "*" };

  try {
    if (req.method === "GET" && pathname === "/healthz") {
      sendJson(res, 200, {
        ok: true,
        status: "healthy",
        env: NODE_ENV,
        uptimeSec: Math.round(process.uptime()),
      });
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

    if (pathname === "/api/admin/calculator") {
      if (req.method === "GET") {
        ensureDataDir();
        if (!fs.existsSync(CALC_FILE)) {
          sendJson(res, 404, { error: "missing_file" });
          return;
        }
        const data = JSON.parse(fs.readFileSync(CALC_FILE, "utf8"));
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
        ensureDataDir();
        fs.writeFileSync(CALC_FILE, JSON.stringify(body, null, 2), "utf8");
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (pathname === "/api/admin/portfolio") {
      if (req.method === "GET") {
        ensureDataDir();
        if (!fs.existsSync(PORTFOLIO_FILE)) {
          sendJson(res, 404, { error: "missing_file" });
          return;
        }
        const data = JSON.parse(fs.readFileSync(PORTFOLIO_FILE, "utf8"));
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
        ensureDataDir();
        fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(body, null, 2), "utf8");
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
  console.log(`ADMIN_PASSWORD=${ADMIN_PASSWORD === "admin" ? "admin (смените через env)" : "(задан)"}`);
});
