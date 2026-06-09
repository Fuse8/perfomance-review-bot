# Separate Internal And Client Form Access

## Problem

Internal и client формы должны иметь разные настройки доступа и требования к
email, но сейчас это не зафиксировано как отдельное поведение workflow.

## Desired Behavior

- Internal review form доступна только fuse8/Google Workspace.
- Internal review form требует email респондента.
- Client review form доступна всем по ссылке.
- Client review form не требует Google аккаунт и email.
- Internal и client формы получают корректный видимый title после копирования
  шаблона.
- Описание Google Forms не меняется workflow.

## Current Context

Workflow уже создает две формы из разных шаблонов. Перед реализацией нужно
проверить настройки Forms API и Drive permissions отдельно для internal и client
forms.

## Plan

- Найти создание internal и client review forms.
- Проверить текущую настройку доступа через Forms API и Drive permissions.
- Настроить internal form: ограниченный доступ fuse8/Workspace и обязательный
  email.
- Настроить client form: публичный доступ по ссылке без обязательного Google
  аккаунта/email.
- Проверить, что настройка одной формы не меняет доступ другой.
- Настроить корректный title для internal и client форм без изменения
  description.

## Tests

- Client review form получает публичный доступ по ссылке.
- Client review form можно заполнить без Google аккаунта.
- Internal review form не становится публичной и требует email.
- Internal и client forms получают разные email collection settings.
- Internal и client forms получают корректные русские Drive file names и
  `info.title`.
- При отключенной client form client template, settings, permissions и title не
  обновляются.

## Risks

- Можно случайно открыть доступ internal form.
- Нужно проверить, используется ли доступ через Drive permissions или Forms API.
- Некоторые настройки Forms могут требовать дополнительных OAuth scopes.

## Result

Готово.

Internal form теперь публикуется, получает `emailCollectionType: VERIFIED` через
Forms API и доступ `domain`/`reader`/`published` только для доменов
`employeeEmailDomains`.

Client form теперь публикуется, получает `emailCollectionType: DO_NOT_COLLECT`
через Forms API и публичный доступ по ссылке через Drive permission
`anyone`/`reader`/`published`.

Для обеих форм Drive file name и видимый Google Form `info.title` задаются в
русском формате:

- `{fullName} // Отзыв Performance review // {YYYY-MM}`
- `{fullName} // Отзыв Performance review от клиента // {YYYY-MM}`

`description` форм не меняется и template strings для description не
подставляются.

Проверено: `pnpm format`, `pnpm eslint:fix`, `pnpm type-check`,
`pnpm test:quiet`.
