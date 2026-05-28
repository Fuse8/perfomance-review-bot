# Docs: Tech Debt по переавторизации

## Summary

Добавить в docs отдельный техдолг: бот сейчас не умеет сам восстанавливаться при старом/отозванном OAuth refresh token. Это проявилось на Calendar scope после Step 7.

## Key Changes

- В `docs/step-7-calendar-meeting.md` добавить раздел `Техдолг`.
- Зафиксировать текущую проблему:
  - `Insufficient Permission` возникает, когда refresh token живой, но без нового scope.
  - `invalid_grant` возникает, когда пользователь отозвал доступ, но токен остался в storage.
  - сейчас бот не удаляет битый токен и не присылает OAuth-ссылку автоматически.
- Зафиксировать желаемое поведение:
  - ловить `invalid_grant` и `Insufficient Permission` при Drive/Calendar вызовах;
  - удалять token из `reviewer_tokens` или local storage;
  - отправлять пользователю OAuth-ссылку;
  - после OAuth позволять повторить `/review`.

## Test Plan

- Docs-only изменение, тесты не нужны.
- После реализации техдолга добавить unit/chat-тесты:
  - `invalid_grant` приводит к auth-required response;
  - `Insufficient Permission` приводит к auth-required response;
  - storage token удаляется или инвалидируется.

## Assumptions

- Пока это только документация техдолга, без изменения кода.
- Детальную реализацию лучше сделать отдельным шагом перед Step 8 или сразу после него.
