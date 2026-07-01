# Tooling: ESLint, Prettier, EditorConfig, Tsconfig

## Problem

В проекте нет единого lint/format workflow. Также `tsconfig` с `moduleResolution: NodeNext` требует explicit file extensions в relative imports, из-за чего TypeScript просит писать импорты вроде `./config.js`.

## Desired Behavior

Проект должен иметь базовые правила ESLint, форматирование через Prettier, EditorConfig для редакторов и понятный TypeScript config. Форматирование проекта использует tabs.

## Current Context

Проект использует TypeScript, ESM (`"type": "module"`), Node 24, `tsx` для dev-запуска и `tsc` для build/type-check. Сейчас `tsconfig.json` использует `module: NodeNext` и `moduleResolution: NodeNext`.

## Plan

- Добавить ESLint с базовыми правилами для TypeScript/Node.
- Добавить Prettier и связать его с ESLint так, чтобы правила форматирования не конфликтовали.
- Добавить EditorConfig и настроить tabs как стандарт отступов.
- Добавить scripts для lint, format, format check и type-check.
- Пересмотреть `tsconfig.json`. Сборку не менять: `NodeNext` остаётся, а `.js` в relative imports сохраняются как ESM runtime-контракт для `node dist/server.js`.
- Проверить совместимость выбранного module/moduleResolution с `tsx`, `tsc`, Vitest и Vercel build.

## Tests

- `pnpm type-check` проходит.
- `pnpm test:quiet` проходит.
- Новый lint script проходит.
- Новый format check script проходит.
- Dev/build сценарии не ломаются.

## Risks

- Смена `moduleResolution` может повлиять на ESM output и production `node dist/server`, поэтому в рамках задачи `moduleResolution: NodeNext` сохраняется.
- ESLint может поднять много существующих предупреждений; правила нужно вводить базово и без массового рефакторинга.
- Prettier изменит много файлов из-за перехода на tabs.

## Result

Добавлены ESLint, Prettier, EditorConfig и npm scripts для lint/format/format check. `tsconfig.json` не изменён: проект остаётся на `module: NodeNext` и `moduleResolution: NodeNext`, чтобы не ломать ESM output, Vercel build и запуск `node dist/server.js`. Relative imports с `.js` остаются.
