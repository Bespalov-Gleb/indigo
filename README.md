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
- `ADMIN_PASSWORD=<strong-password>`

Важно: не оставляйте пароль по умолчанию `admin`.

## Деплой (универсально)

1. Поднимите Node.js приложение с командой:
   - `npm ci --omit=dev` (или `npm install --production`)
   - `npm start`
2. Прокиньте внешний порт на `PORT`.
3. Настройте health-check на `/healthz`.
4. Для HTTPS используйте reverse proxy (Nginx/Cloudflare/платформа).

## Структура данных

- Калькулятор: `site/data/calculator.json`
- Портфолио: `site/data/portfolio.json`

Из админки данные сохраняются через API в эти файлы, поэтому процесс должен иметь права на запись в `site/data/`.

## Проверка перед деплоем

```bash
npm run check
```

## Готовые шаблоны деплоя

- Пошагово под ваш домен: `deploy/DEPLOY_DEV-STUDIO-INDIGO.md`
- Конфиг Nginx: `deploy/nginx/dev-studio-indigo.ru.conf`
- Сервис systemd: `deploy/systemd/develop-studio.service`

