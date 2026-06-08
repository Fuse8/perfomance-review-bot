# Google API Types

## Problem

В проекте есть места с типами вроде `Record<string, ...>`, где хотелось бы использовать типы Google API.

## Desired Behavior

Типизация Google Chat/Form events должна быть настолько строгой, насколько позволяют официальные пакеты и реальные payloads.

## Current Context

Проект использует TypeScript и Google APIs. Нужно проверить, какие типы доступны из установленных зависимостей и где сейчас используются ручные `Record`-типы.

## Plan

- Найти все `Record<string, ...>` вокруг Google payloads.
- Проверить типы из `googleapis` и связанных пакетов.
- Заменять ручные типы только там, где официальный тип реально подходит.
- Для несовпадений оставить локальные narrow-типы с runtime-safe parsing.

## Tests

- TypeScript compilation проходит.
- Существующие tests проходят.
- Реальные Google Chat payloads не ломаются из-за слишком узких типов.

## Risks

- Официальные типы Google могут быть неполными для Chat dialog events.
- Чрезмерная типизация может ухудшить поддержку нестандартных payloads.

## Result

Добавлены алиасы Google Chat типов из `googleapis` для event/common/form inputs/message/card payloads.
`src/chat.ts` переведён с ручных `Record<string, unknown>` на эти типы там, где это Google Chat response/card/form payloads.
Calendar, Drive, Docs, Forms и People resource-типы сверены с `googleapis`; параметры и ответы переведены на официальные schema/params типы, где это совместимо с тестовыми фейками.
Локальные narrow-типы сохранены только для несовпадающих runtime-полей, тестируемых resource-срезов и логирования.
