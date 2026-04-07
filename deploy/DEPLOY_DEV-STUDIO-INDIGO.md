# Деплой на `dev-studio-indigo.ru` (Ubuntu + Nginx + systemd)

## 1) DNS у регистратора

Добавьте записи:

- `A` для `@` -> `IP_ВАШЕГО_СЕРВЕРА`
- `A` для `www` -> `IP_ВАШЕГО_СЕРВЕРА`

Подождите обновления DNS (обычно 5-30 минут, иногда дольше).

## 2) Подготовка сервера

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

Установите Node.js 18+ (например через NodeSource или nvm).

## 3) Размещение проекта

```bash
sudo mkdir -p /var/www
sudo chown -R $USER:$USER /var/www
cd /var/www
git clone <URL_ВАШЕГО_РЕПО> develop_studio
cd develop_studio
npm ci --omit=dev
cp .env.example .env
```

Отредактируйте `.env`:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=8787
ADMIN_PASSWORD=СИЛЬНЫЙ_СЛОЖНЫЙ_ПАРОЛЬ
```

Проверьте проект:

```bash
npm run check
```

## 4) systemd (автозапуск)

```bash
sudo cp deploy/systemd/develop-studio.service /etc/systemd/system/develop-studio.service
sudo systemctl daemon-reload
sudo systemctl enable develop-studio
sudo systemctl start develop-studio
sudo systemctl status develop-studio --no-pager
```

Логи:

```bash
journalctl -u develop-studio -f
```

## 5) Nginx

```bash
sudo cp deploy/nginx/dev-studio-indigo.ru.conf /etc/nginx/sites-available/dev-studio-indigo.ru.conf
sudo ln -sf /etc/nginx/sites-available/dev-studio-indigo.ru.conf /etc/nginx/sites-enabled/dev-studio-indigo.ru.conf
sudo nginx -t
sudo systemctl reload nginx
```

Проверка без SSL:

- `http://dev-studio-indigo.ru/` -> редирект на `/site/index.html`
- `http://dev-studio-indigo.ru/healthz`

## 6) SSL (Let's Encrypt)

```bash
sudo certbot --nginx -d dev-studio-indigo.ru -d www.dev-studio-indigo.ru
```

Проверьте автообновление сертификатов:

```bash
sudo certbot renew --dry-run
```

## 7) Обновление релиза

```bash
cd /var/www/develop_studio
git pull
npm ci --omit=dev
npm run check
sudo systemctl restart develop-studio
sudo systemctl status develop-studio --no-pager
```

## 8) Рекомендации по безопасности

- Сразу смените `ADMIN_PASSWORD` на сложный.
- По возможности ограничьте доступ к `/site/admin/` по IP на уровне Nginx.
- Отключите root-логин по паролю на сервере, используйте SSH-ключи.

