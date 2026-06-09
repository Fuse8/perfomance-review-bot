# Separate Internal And Client Form Access

## Problem

Internal и client формы должны иметь разные настройки доступа и требования к
email, но сейчас это не зафиксировано как отдельное поведение workflow.

## Desired Behavior

- Internal review form доступна только fuse8/Google Workspace.
- Internal review form требует email респондента.
- Client review form доступна всем по ссылке.
- Client review form не требует Google аккаунт и email.
- Описание клиентской Google Form использует шаблонные строки со значениями из
  workflow.

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
- Подставлять значения workflow в шаблонные строки описания client form.

## Tests

- Client review form получает публичный доступ по ссылке.
- Client review form можно заполнить без Google аккаунта.
- Internal review form не становится публичной и требует email.
- Описание client form содержит подставленные значения после уточнения шаблонов.

## Risks

- Можно случайно открыть доступ internal form.
- Нужно проверить, используется ли доступ через Drive permissions или Forms API.
- Некоторые настройки Forms могут требовать дополнительных OAuth scopes.

## Result

Заполнить после реализации.
