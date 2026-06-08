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

Заполнить после реализации.
