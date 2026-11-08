# SETKA PRO

Русскоязычная система управления армрестлинг-турнирами на React + TypeScript + Vite и Supabase Auth/DB. Публикация выполняется через GitHub Actions на GitHub Pages.

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

SQL-скрипты проекта расположены в `supabase/migrations/`. Для новой базы применяйте 001–015 по порядку, затем `supabase/manual/016_role_based_access_control.sql`, затем `supabase/migrations/017_validate_match_integrity.sql`.

**Для уже работающего проекта не запускайте все скрипты повторно.** Сначала сверяйте историю миграций Supabase и фактическую схему. В рабочем проекте SETKAARM часть ранних изменений была применена вручную и не отражена в истории миграций; повторное выполнение старых скриптов без сверки может изменить политики доступа или структуру.

Последняя миграция `017_validate_match_integrity.sql` добавляет серверную проверку участников, победителя и счёта матча.

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

## Основные возможности

- аккаунты, подтверждение email, вход и восстановление пароля;
- роли персонала и разграничение доступа через Supabase RLS;
- турниры, заявки и регистрация спортсменов;
- клубы, весовые категории и взвешивание;
- олимпийские, двойные и круговые турнирные сетки;
- результаты, переходы между матчами, фолы и замечания;
- история изменений, архив сеток и резервные копии;
- экспорт турнирной сетки в SVG и PNG;
- персональные настройки оформления.

Документы турниров, назначения судей, расписание столов, командный зачёт и публичные табло остаются отдельными направлениями развития.
