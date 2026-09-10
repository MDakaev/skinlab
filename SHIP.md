# Ship checklist — SkinLab Workers

Use before calling the product “done” or handing off.

## Local

- [x] `npm install`
- [x] D1 migration applies (`npm run db:migrate:local`)
- [x] `wrangler deploy --dry-run` builds Worker + assets
- [x] `GET /health` → ok
- [x] `GET /api/plans` → four plans
- [x] Mini App `/`, `/app.css`, `/app.js` serve
- [x] Legal pages serve
- [x] Legal text: agreement + privacy with tariffs and support (no personal operator IDs)
- [x] Bot buttons/commands for legal docs (`/terms`, `/privacy`)
- [x] `/admin/` serves; `/api/admin/stats` 403 without secret, 200 with secret
- [x] Telegram webhook rejects bad secret
- [x] Auth without bot token fails closed

## Production (owner / buyer)

- [x] Legal: temporary verify marker removed
- [x] `wrangler d1 create skinlab` + real `database_id` in `wrangler.toml`
- [ ] Secrets set (`TELEGRAM_*`, `PLATEGA_*`, `ADMIN_SECRET`)
- [x] `PUBLIC_BASE_URL` set to deployed origin
- [x] `npm run db:migrate:remote` + `npm run deploy` (re-deploy after each change)
- [ ] `setWebhook` + `POST /telegram/configure` (if bot menu outdated)
- [ ] Platega callback URL: `https://skinlab.skinlabapp.workers.dev/api/platega/webhook`
- [ ] Real `/start` in Telegram replies
- [ ] Test payment → subscription active in Mini App
- [ ] Admin shows user + payment + active subscription row
