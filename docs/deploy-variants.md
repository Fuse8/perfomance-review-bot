# Варианты запуска

| Вариант | Billing GCP | Когда |
|--------|-------------|--------|
| **Локально + tunnel** | Нет | Dev, тест Chat | → [local-google-chat-test.md](local-google-chat-test.md) |
| **Vercel + Neon** | Нет для runtime, отдельно Neon | Preview/prod без Cloud Run | → [vercel-neon-deploy.md](vercel-neon-deploy.md) |
| **Cloud Run** | Да (часто $0 на free tier) | Staging/prod | → [google-chat-mvp-test.md](google-chat-mvp-test.md) |
| **Apps Script** | Нет | Быстрый прототип Drive/Forms без нормального Chat backend | — |
| **Свой VPS** | Нет (платится хост) | Стабильный URL без GCP | Docker + HTTPS |

Cloud Run при min instances = 0 в простое почти не тарифицируется; Firestore/Build — мелочи на MVP.

Стоимость Google API: [pricing.md](pricing.md).
