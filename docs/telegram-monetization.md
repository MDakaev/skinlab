# Telegram + лицензия SkinLab (будущий production flow)

Сейчас лицензия работает как на Web:

1. Пользователь покупает через ЮKassa **или** вводит код.
2. Entitlement хранится в `localStorage` → ключ `skinlab.license.v1`.
3. Pro: **Идеал** + **Мой уход** (недельный план). Free: Сочетания + Активы.

Paywall UI уже общий — отдельную Telegram-логику paywall не дублируем.

---

## Целевая схема (позже)

```text
Telegram Mini App
       │
       │  initData (signed)
       ▼
POST /api/telegram/auth     ← HMAC validate, TELEGRAM_BOT_TOKEN только на сервере
       │
       ▼
trusted telegram_user_id
       │
       ▼
licenses / entitlements     ← привязка к telegram_id, не к «тому же браузеру»
       │
       ▼
SkinLab Pro
```

### Что изменится

| Сейчас | Будущее |
|--------|---------|
| Лицензия на устройство (localStorage) | Лицензия на Telegram-аккаунт |
| Redeem кода вручную | Redeem + авто-привязка после оплаты |
| Смена телефона = потеря без кода | Тот же Telegram → тот же Pro |

### Что не менять без нужды

- ЮKassa checkout flow (пока работает).
- Клиентский gate `isLicensed()` как UX (не как криптозащита).
- Бесплатные разделы.

---

## Telegram Stars

Пока **не** внедряем. Имеет смысл только если:

- основная аудитория — внутри Telegram;
- ЮKassa/карты неудобны для гео;
- вы готовы к правилам Telegram Payments / Stars.

До решения бизнес-модели оставляем разовую лицензию через текущий checkout + код.

---

## Безопасность монетизации

1. Не выдавать Pro по `initDataUnsafe.user.id` с клиента.
2. Checkout / redeem / bind — только после `validateInitData` на сервере.
3. Не хранить bot token и платёжные секреты во frontend / SW.
4. Не логировать полные платёжные payload’ы и initData.

---

## Промежуточный этап (сейчас)

- В Telegram localStorage всё ещё ок для MVP.
- `storage.js` готов к замене backend’ом.
- `POST /api/telegram/auth` готов как фундамент привязки.
- Документ `telegram-setup.md` — BotFather без автоматизации из frontend.
