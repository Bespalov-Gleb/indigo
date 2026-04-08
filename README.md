# INDIGO Website Deployment

Сайт и админка работают на Node.js сервере `server.mjs`.

## Требования

- Node.js 18+
- npm

## Локальный запуск

```bash
npm install
npm start
```

- Сайт: `http://127.0.0.1:8787/site/index.html`
- Админка: `http://127.0.0.1:8787/site/admin/`
- Healthcheck: `http://127.0.0.1:8787/healthz`

## Production переменные окружения

Скопируйте `.env.example` в `.env` и задайте значения:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=8787` (или порт платформы)
- `CORS_ORIGIN=https://dev-studio-indigo.ru`
- `DB_PATH=./data/indigo.db`
- `ADMIN_PASSWORD=<strong-password>`

Важно: `ADMIN_PASSWORD` обязателен. Сервер не запустится без него.

## Деплой (универсально)

1. Поднимите Node.js приложение с командой:
   - `npm ci --omit=dev` (или `npm install --production`)
   - `npm start`
2. Прокиньте внешний порт на `PORT`.
3. Настройте health-check на `/healthz`.
4. Для HTTPS используйте reverse proxy (Nginx/Cloudflare/платформа).

## Хранение данных

- Основной источник данных: SQLite база (`DB_PATH`, по умолчанию `./data/indigo.db`)
- При первом запуске база автоматически заполняется из:
  - `site/data/calculator.json`
  - `site/data/portfolio.json`

После инициализации админка пишет в БД.

## Проверка перед деплоем

```bash
npm run check
```

## Docker

Сборка и запуск контейнера:

```bash
docker build -t indigo-site .
docker run -d --name indigo-site \
  -p 8787:8787 \
  -e NODE_ENV=production \
  -e HOST=0.0.0.0 \
  -e PORT=8787 \
  -e CORS_ORIGIN=https://dev-studio-indigo.ru \
  -e DB_PATH=/app/data/indigo.db \
  -e ADMIN_PASSWORD=<strong-password> \
  -v $(pwd)/data:/app/data \
  indigo-site
```

Или через `docker compose`:

```bash
docker compose up -d --build
```

Проверка:

- `http://127.0.0.1:8787/site/index.html`
- `http://127.0.0.1:8787/healthz`

## Готовые шаблоны деплоя

- Пошагово под ваш домен: `deploy/DEPLOY_DEV-STUDIO-INDIGO.md`
- Конфиг Nginx: `deploy/nginx/dev-studio-indigo.ru.conf`
- Сервис systemd: `deploy/systemd/develop-studio.service`

