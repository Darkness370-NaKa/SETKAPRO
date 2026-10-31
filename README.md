# SETKA PRO

Стартовое русскоязычное веб-приложение для армрестлинг-турниров. Включает React + TypeScript + Vite, Supabase Auth/DB, SQL-миграцию и автоматическую публикацию на GitHub Pages.

## Загрузка в GitHub

1. Распакуйте архив.
2. Загрузите **содержимое папки `setka-pro`** в корень репозитория `Darkness370-NaKa/SETKAPRO`.
3. Сделайте Commit в ветку `main`.
4. В репозитории откройте Settings → Pages и выберите Source: **GitHub Actions**.

Workflow `.github/workflows/deploy.yml` соберёт проект и опубликует его по адресу:
`https://darkness370-naka.github.io/SETKAPRO/`

## Переменные GitHub

В Settings → Secrets and variables → Actions → Variables добавьте:

- `VITE_SUPABASE_URL` = `https://gljngeekzipuikzmuyva.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY` = ваш публичный Supabase publishable key.

Publishable key предназначен для браузера. Никогда не добавляйте `service_role` или secret key.

## Supabase

SQL-миграция находится в `supabase/migrations/001_initial_schema.sql`. Она уже выполнялась в вашем проекте, поэтому повторно запускать её без необходимости не нужно.

После публикации в Supabase → Authentication → URL Configuration укажите:

- Site URL: `https://darkness370-naka.github.io/SETKAPRO/`
- Redirect URL: `https://darkness370-naka.github.io/SETKAPRO/**`

Локальный адрес `http://localhost:5173/**` можно оставить для разработки.

## Локальный запуск (необязательно)

Требуется Node.js 20+.

```bash
npm install
cp .env.example .env.local
```

Заполните `.env.local` значениями Supabase и выполните:

```bash
npm run dev
```

## Что входит в этот этап

- регистрация, вход, выход и восстановление пароля;
- автоматическая роль `OBSERVER` для новых аккаунтов;
- список опубликованных турниров и подача заявок;
- просмотр своих заявок и рассмотрение заявок персоналом при наличии соответствующей роли;
- SQL-схема, роли и RLS-политики.

Это первый этап, а не полный перенос всех функций SETKA 2.0. Сетки, судейство, взвешивание, клубы, документы и командный зачёт ещё требуют реализации и проверки.
