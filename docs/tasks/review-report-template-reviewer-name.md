# Review Report Template Reviewer Name

## Problem

Шаблон отчета Performance Review финализирован, но текущая подстановка использует
email ревьюера вместо имени.

## Desired Behavior

- Отчет создается из Google Docs template
  `14inqT-wOe9iOu8lPosJNago-fhr3IN05TWhQQKVCosw`.
- В шаблон подставляется `REVIEWER_NAME`, а не `REVIEWER_EMAIL`.
- Имя ревьюера берется из OAuth profile или People API, с fallback на email.

## Current Context

Сейчас `REVIEW_REPORT_TEMPLATE_ID` читается из env, а в `src/drive.ts`
подставляется `{{REVIEWER_EMAIL}}`.

## Plan

- Зафиксировать новый template ID в `.env.example` и документации.
- Найти источник имени текущего ревьюера в OAuth/People flow.
- Передавать reviewer name в создание отчета.
- Заменить placeholder `{{REVIEWER_EMAIL}}` на `{{REVIEWER_NAME}}`.
- Оставить fallback на email, если имя получить не удалось.

## Tests

- `pnpm test:quiet`
- Отчет получает `REVIEWER_NAME`.
- При отсутствии имени workflow не падает и использует email.

## Risks

- Можно сломать существующие шаблоны, если в них остался старый placeholder.
- People API может быть недоступен без нужного scope.

## Result

Заполнить после реализации.
