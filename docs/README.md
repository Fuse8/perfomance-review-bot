# Documentation Guide

Этот каталог - рабочая база знаний проекта.

## Основные файлы

- [roadmap.md](roadmap.md) - актуальные направления работ и ссылки на задачи.
- [tasks/](tasks/) - подробные планы по отдельным задачам.
- [decisions.md](decisions.md) - принятые технические и продуктовые решения.
- [archive/](archive/) - завершенные задачи и старые планы.
- [product-spec.md](product-spec.md) - описание продукта и сценариев.
- [development.md](development.md) - локальная разработка.
- [google-chat-bot-setup.md](google-chat-bot-setup.md) - настройка Google Chat app.
- [deploy.md](deploy.md) - деплой на Vercel + Neon.

## Как работать

1. Перед началом работы выбрать задачу из [roadmap.md](roadmap.md).
2. Если задачи нет, добавить ее в roadmap и создать файл в [tasks/](tasks/).
3. В task-файле описать проблему, ожидаемое поведение, план, тесты и риски.
4. После реализации заполнить `Result` в task-файле.
5. Перенести выполненный task-файл из `tasks/` в `archive/`.
6. Если принято устойчивое решение, добавить запись в [decisions.md](decisions.md).

`roadmap.md` должен оставаться коротким. Детали активной реализации хранятся в `tasks/`, завершенной - в `archive/`.
