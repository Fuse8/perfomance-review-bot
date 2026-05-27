# Performance Review Bot Implementation Plan

## Goal

Довести Google Chat бота до полного сценария Performance Review: `/check` проверяет, что бот живой, `/review` запускает создание папки, документов, форм, календарной встречи и задач.

## Global Plan

### Что уже работает

- Локальный запуск через `pnpm dev:local`.
- Публичный URL через `ngrok`.
- Google Chat получает события.
- `/check` отвечает `hello world`.
- `/review` открывает диалог.
- OAuth работает.
- Drive API включён.
- Бот может создавать папки в Google Drive.

### Что нужно доделать

- Заменить тестовое создание папки на полный workflow.
- Искать папку сотрудника в `REVIEWS_ROOT_FOLDER_ID`.
- Создавать папку месяца `YYYY.MM`.
- Создавать PR report из шаблона.
- Создавать internal feedback form.
- Опционально создавать client feedback form.
- Искать предыдущее ревью.
- Создавать календарную встречу.
- Создавать задачи/reminders.
- Возвращать итоговый отчёт в Google Chat.
- Обновить README и env-документацию.

## Step-by-Step Plan

### Step 1: Stabilize Current `/review`

**Goal:** текущий сценарий должен стабильно работать end-to-end.

- Оставить `/check` как smoke-test.
- `/review` должен:
  - открыть диалог;
  - принять ФИО, дату, чекбокс клиентской формы;
  - создать тестовую папку;
  - вернуть ссылку в чат.
- Добавить user-facing ошибки, если Drive API падает.
- Проверка:
  - `/check` отвечает `hello world`;
  - `/review` создаёт папку и присылает ссылку.

### Step 2: Person Folder Lookup

**Goal:** создавать ревью внутри папки сотрудника, а не в root.

- В `REVIEWS_ROOT_FOLDER_ID` искать папку по ФИО.
- Нормализовать ФИО: trim, lowercase, убрать лишние пробелы.
- Если папка не найдена, вернуть ошибку в чат.
- Если найдена, создать внутри неё папку `YYYY.MM`.
- Проверка:
  - при существующей папке сотрудника создаётся `YYYY.MM`;
  - при отсутствующей папке бот пишет понятную ошибку.

### Step 3: Employee Email

**Goal:** определить email сотрудника для доступов и календаря.

- Добавить шаг/поле email, если email нельзя определить автоматически.
- Для первого варианта не делать сложный Directory API.
- Валидировать домен email.
- Выдать сотруднику доступ на созданные артефакты.
- Проверка:
  - сотрудник получает доступ к папке/report doc.

### Step 4: PR Report Template

**Goal:** создавать основной документ ревью.

- Добавить env `REVIEW_REPORT_TEMPLATE_ID`.
- Копировать Google Doc template в папку месяца.
- Название: `{Имя Фамилия} // Отчёт Performance Review // YYYY-MM`.
- Заполнить базовые поля:
  - ФИО;
  - дата ревью;
  - reviewer;
  - ссылка на папку;
  - ссылка на предыдущее ревью, если есть.
- Проверка:
  - report doc создаётся;
  - ссылка возвращается в чат.

### Step 5: Feedback Forms

**Goal:** создавать формы для сбора отзывов.

- Добавить env:
  - `INTERNAL_REVIEW_FORM_TEMPLATE_ID`;
  - `CLIENT_REVIEW_FORM_TEMPLATE_ID`.
- Всегда создавать internal form.
- Client form создавать только если выбран чекбокс.
- Копировать формы в папку месяца.
- Вернуть ссылки в итоговом сообщении.
- Проверка:
  - без чекбокса создаётся 1 форма;
  - с чекбоксом создаются 2 формы.

### Step 6: Previous Review Lookup

**Goal:** находить прошлое ревью сотрудника.

- В папке сотрудника искать предыдущие PR report docs.
- Самый свежий предыдущий документ считать прошлым ревью.
- Если прошлое ревью не найдено, показать подтверждение:
  - “Предыдущее ревью не найдено. Продолжить без него?”
- Проверка:
  - сценарий с прошлым ревью;
  - сценарий без прошлого ревью.

### Step 7: Calendar Meeting

**Goal:** создать встречу Performance Review.

- Добавить Calendar OAuth scope.
- Создать событие на выбранную дату/время.
- Timezone: `Asia/Yekaterinburg`.
- Duration: `2.5h`.
- Attendees:
  - reviewer;
  - employee.
- В description добавить ссылки на report/forms.
- Проверка:
  - событие появляется в календаре;
  - участники добавлены;
  - ссылки есть в описании.

### Step 8: Reviewer Tasks / Reminders

**Goal:** создать напоминания reviewer’у.

- Добавить env:
  - `TASK_COLLECT_DAYS_BEFORE`;
  - `TASK_CHECK_DAYS_BEFORE`;
  - `TASK_PREPARE_DAYS_BEFORE`.
- Создать 3 reminder-события или задачи:
  - запустить сбор отзывов;
  - проверить отзывы;
  - подготовиться к ревью.
- Даты считать назад от даты ревью по рабочим дням.
- Проверка:
  - созданы 3 reminder;
  - даты корректные.

### Step 9: Final Report Message

**Goal:** после `/review` бот присылает полный отчёт.

Итоговое сообщение должно содержать:

- ссылка на папку месяца;
- ссылка на PR report;
- ссылка на internal feedback form;
- ссылка на client feedback form, если создавалась;
- ссылка/summary календарной встречи;
- список созданных reminders.

### Step 10: Documentation Cleanup

**Goal:** README должен позволять поднять проект с нуля.

- Убрать старые упоминания `/ping`.
- Описать `/check` и `/review`.
- Описать env vars.
- Описать OAuth scopes.
- Описать запуск:
  - `pnpm dev:local`;
  - `pnpm tunnel`;
  - Google Chat webhook URL.
- Описать типичные ошибки:
  - Drive API disabled;
  - folder not found;
  - bot not responding;
  - ngrok URL changed.

## Recommended Execution Order

1. Step 1-2: закрепить Drive workflow.
2. Step 3-5: добавить документы и формы.
3. Step 6-8: добавить бизнес-логику ревью.
4. Step 9-10: финальный отчёт и документация.

## Acceptance Criteria

- `/check` отвечает `hello world`.
- `/review` не показывает “bot not responding”.
- Создаётся папка месяца внутри папки сотрудника.
- Создаётся PR report.
- Создаётся internal feedback form.
- Client feedback form создаётся только по чекбоксу.
- Создаётся календарная встреча.
- Создаются reminders.
- Бот присылает итоговый отчёт со всеми ссылками.
