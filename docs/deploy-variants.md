1. За что потенциально будет billing

Для нашего MVP:

Cloud Run: запуск HTTP-сервера бота.
Платится за requests, CPU/RAM во время обработки, исходящий трафик. При min instances = 0 простой почти не стоит.

Cloud Build: сборка контейнера при deploy через --source ..
Платится за build minutes, но редкие сборки обычно попадают в free tier.

Artifact Registry / Container Registry: хранение Docker image.
Обычно копейки, если не копить много старых образов.

Firestore: хранение OAuth-токенов и OAuth state.
Для MVP это десятки документов, обычно бесплатно.

Cloud Logging: логи Cloud Run.
Обычно бесплатно, если не логировать много мусора.

Secret/env vars: сейчас секреты лежат в env Cloud Run, отдельно не тарифицируются. Если потом перенести в Secret Manager, там тоже есть free tier.

Google Drive API / Chat API: сами API обычно без отдельной платы, но есть квоты.

Ожидаемый расход для MVP при редком тестировании: $0 или центы. Но Google требует подключенный billing account, потому что Cloud Run, Cloud Build и Artifact Registry относятся к платным сервисам даже при free tier.

Официально: Cloud Run имеет always-free tier, Cloud Build и Firestore тоже имеют бесплатные квоты: Cloud Run pricing, Cloud Build pricing, Firestore pricing, Google Cloud free tier.

2. Варианты без billing

Да, но с компромиссами.

Вариант A: Google Apps Script
Лучший вариант без billing.

Плюсы:

не нужен Cloud Run;
не нужен billing;
проще работать с Drive/Forms/Calendar;
можно быстро протестировать создание папок/форм/доков.
Минусы:

хуже нормальная backend-архитектура;
хуже тесты/CI;
сложнее полноценный Google Chat dialog;
квоты Apps Script;
для production менее удобно.
Для MVP можно сделать Apps Script Web App и подключить его как Google Chat endpoint.

Вариант B: локальный сервер + публичный tunnel
Например ngrok, cloudflared tunnel, localtunnel.

Плюсы:

не нужен Google Cloud billing;
быстро проверить Google Chat webhook.
Минусы:

компьютер должен быть включен;
URL временный;
OAuth redirect URI надо менять под tunnel URL;
это только dev/test, не production.
Вариант C: свой VPS
Billing Google Cloud не нужен.

Плюсы:

можно деплоить без GCP billing;
стабильный URL.
Минусы:

VPS сам платный;
нужно настраивать домен, HTTPS, systemd/Docker, обновления, безопасность.
Вариант D: Firebase/Cloud Functions без billing
Сейчас для Cloud Functions 2nd gen / Cloud Run-backed функций billing все равно нужен. Не подходит.

Моя рекомендация
Если цель прямо сейчас “пощупать в Google Chat без карты”, самый быстрый путь: локальный сервер + cloudflared/ngrok tunnel.
Если цель сделать MVP без Google Cloud billing, но с Google-интеграциями: Apps Script.
