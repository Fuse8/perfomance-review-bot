# Feedback Form Template Env Vars

Completed: 2026-06-10

## Problem

Feedback form template IDs были встроены в `src/config.ts`, из-за чего их нельзя
менять через окружение для разных deploy/runtime конфигураций.

## Desired Behavior

- Internal review form template ID читается из
  `INTERNAL_REVIEW_FORM_TEMPLATE_ID`.
- Client review form template ID читается из
  `CLIENT_REVIEW_FORM_TEMPLATE_ID`.
- Обе переменные обязательны при старте приложения.
- `.env.example` и deploy docs явно перечисляют обе переменные.

## Current Context

Архивная задача
[Feedback form templates shared folder](0008-feedback-form-templates-shared-folder.md)
перенесла form template IDs из env в `src/config.ts`. Нужно было вернуть прежний
env-based источник без изменения `AppConfig` и Drive workflow.

## Plan

- Заменить hardcoded form template IDs в `src/config.ts` на `requiredEnv`.
- Обновить `src/config.test.ts`: проверить чтение обоих IDs из env и ошибки при
  отсутствии каждой переменной.
- Вернуть переменные в `.env.example`.
- Добавить переменные в Vercel env список в `docs/deploy.md`.
- Не менять исторический архивный документ.

## Tests

- `pnpm test:quiet src/config.test.ts`
- `pnpm format`
- `pnpm eslint:fix`
- `pnpm type-check`
- `pnpm test:quiet`

## Risks

- Deploy без новых env переменных начнет падать с `Missing required env var`.
- Можно перепутать internal и client template IDs при настройке окружения.

## Result

Готово.

`internalReviewFormTemplateId` и `clientReviewFormTemplateId` снова читаются из
обязательных env переменных `INTERNAL_REVIEW_FORM_TEMPLATE_ID` и
`CLIENT_REVIEW_FORM_TEMPLATE_ID`.

`.env.example` и `docs/deploy.md` обновлены для локальной и Vercel настройки.
Тесты `src/config.test.ts` покрывают чтение значений и ошибки отсутствующих env.

Проверено: `pnpm test:quiet src/config.test.ts`, `pnpm format`,
`pnpm eslint:fix`, `pnpm type-check`, `pnpm test:quiet`.
