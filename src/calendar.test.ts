import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReviewerReminderDate,
  createReviewerReminderEventsInCalendar,
  createCalendarEventInCalendar
} from "./calendar.js";

test("createCalendarEventInCalendar creates a 2.5h review meeting with links", async () => {
  const insertedEvents: unknown[] = [];
  const calendar = {
    events: {
      async insert(params: unknown) {
        insertedEvents.push(params);
        return {
          data: {
            id: "event-id",
            summary: "Performance Review: Ivan Petrov",
            htmlLink: "https://calendar.google.com/event?eid=event-id"
          }
        };
      }
    }
  };

  const event = await createCalendarEventInCalendar(calendar, {
    fullName: "Ivan Petrov",
    employeeEmail: "ivan.petrov@example.test",
    reviewerEmail: "reviewer@example.test",
    reviewDate: "2026-06-15",
    meetingTime: "14:30",
    folderUrl: "https://drive.google.com/folder",
    reportUrl: "https://docs.google.com/document/report-id",
    internalFormUrl: "https://docs.google.com/forms/internal-form-id",
    clientFormUrl: "https://docs.google.com/forms/client-form-id",
    previousReviewUrl: "https://docs.google.com/document/previous-report-id"
  });

  assert.deepEqual(event, {
    id: "event-id",
    summary: "Performance Review: Ivan Petrov",
    htmlLink: "https://calendar.google.com/event?eid=event-id",
    startDateTime: "2026-06-15T14:30:00+05:00"
  });
  assert.deepEqual(insertedEvents, [
    {
      calendarId: "primary",
      requestBody: {
        summary: "Performance Review: Ivan Petrov",
        description: [
          "Review folder: https://drive.google.com/folder",
          "PR report: https://docs.google.com/document/report-id",
          "Internal feedback form: https://docs.google.com/forms/internal-form-id",
          "Client feedback form: https://docs.google.com/forms/client-form-id",
          "Previous review: https://docs.google.com/document/previous-report-id"
        ].join("\n"),
        start: {
          dateTime: "2026-06-15T14:30:00+05:00",
          timeZone: "Asia/Yekaterinburg"
        },
        end: {
          dateTime: "2026-06-15T17:00:00+05:00",
          timeZone: "Asia/Yekaterinburg"
        },
        attendees: [
          { email: "reviewer@example.test" },
          { email: "ivan.petrov@example.test" }
        ]
      }
    }
  ]);
});

test("buildReviewerReminderDate subtracts working days and skips weekends", () => {
  assert.equal(buildReviewerReminderDate("2026-06-15", 14), "2026-05-26");
  assert.equal(buildReviewerReminderDate("2026-06-15", 7), "2026-06-04");
  assert.equal(buildReviewerReminderDate("2026-06-15", 3), "2026-06-10");
  assert.equal(buildReviewerReminderDate("2026-06-08", 1), "2026-06-05");

  for (const daysBefore of [1, 3, 7, 14, 20]) {
    const date = new Date(`${buildReviewerReminderDate("2026-06-15", daysBefore)}T00:00:00Z`);
    assert.notEqual(date.getUTCDay(), 0);
    assert.notEqual(date.getUTCDay(), 6);
  }
});

test("createReviewerReminderEventsInCalendar creates 3 reviewer reminder events with links", async () => {
  const insertedEvents: unknown[] = [];
  const calendar = {
    events: {
      async insert(params: unknown) {
        insertedEvents.push(params);
        return {
          data: {
            id: `reminder-${insertedEvents.length}`,
            summary: (params as { requestBody: { summary: string } }).requestBody.summary,
            htmlLink: `https://calendar.google.com/event?eid=reminder-${insertedEvents.length}`
          }
        };
      }
    }
  };

  const events = await createReviewerReminderEventsInCalendar(
    calendar,
    {
      taskCollectDaysBefore: 14,
      taskCheckDaysBefore: 7,
      taskPrepareDaysBefore: 3,
      taskReminderTime: "12:00"
    },
    {
      fullName: "Ivan Petrov",
      employeeEmail: "ivan.petrov@example.test",
      reviewerEmail: "reviewer@example.test",
      reviewDate: "2026-06-15",
      meetingTime: "14:30",
      folderUrl: "https://drive.google.com/folder",
      reportUrl: "https://docs.google.com/document/report-id",
      internalFormUrl: "https://docs.google.com/forms/internal-form-id",
      clientFormUrl: "https://docs.google.com/forms/client-form-id",
      previousReviewUrl: "https://docs.google.com/document/previous-report-id"
    }
  );

  assert.deepEqual(events.map((event) => event.summary), [
    "Запустить сбор отзывов для PR Ivan Petrov",
    "Проверить отзывы для PR Ivan Petrov",
    "Подготовиться к проведению PR Ivan Petrov"
  ]);
  assert.deepEqual(insertedEvents, [
    {
      calendarId: "primary",
      requestBody: {
        summary: "Запустить сбор отзывов для PR Ivan Petrov",
        description: [
          "Review folder: https://drive.google.com/folder",
          "PR report: https://docs.google.com/document/report-id",
          "Internal feedback form: https://docs.google.com/forms/internal-form-id",
          "Client feedback form: https://docs.google.com/forms/client-form-id",
          "Previous review: https://docs.google.com/document/previous-report-id"
        ].join("\n"),
        start: {
          dateTime: "2026-05-26T12:00:00+05:00",
          timeZone: "Asia/Yekaterinburg"
        },
        end: {
          dateTime: "2026-05-26T12:30:00+05:00",
          timeZone: "Asia/Yekaterinburg"
        },
        attendees: [
          { email: "reviewer@example.test" }
        ]
      }
    },
    {
      calendarId: "primary",
      requestBody: {
        summary: "Проверить отзывы для PR Ivan Petrov",
        description: [
          "Review folder: https://drive.google.com/folder",
          "PR report: https://docs.google.com/document/report-id",
          "Internal feedback form: https://docs.google.com/forms/internal-form-id",
          "Client feedback form: https://docs.google.com/forms/client-form-id",
          "Previous review: https://docs.google.com/document/previous-report-id"
        ].join("\n"),
        start: {
          dateTime: "2026-06-04T12:00:00+05:00",
          timeZone: "Asia/Yekaterinburg"
        },
        end: {
          dateTime: "2026-06-04T12:30:00+05:00",
          timeZone: "Asia/Yekaterinburg"
        },
        attendees: [
          { email: "reviewer@example.test" }
        ]
      }
    },
    {
      calendarId: "primary",
      requestBody: {
        summary: "Подготовиться к проведению PR Ivan Petrov",
        description: [
          "Review folder: https://drive.google.com/folder",
          "PR report: https://docs.google.com/document/report-id",
          "Internal feedback form: https://docs.google.com/forms/internal-form-id",
          "Client feedback form: https://docs.google.com/forms/client-form-id",
          "Previous review: https://docs.google.com/document/previous-report-id"
        ].join("\n"),
        start: {
          dateTime: "2026-06-10T12:00:00+05:00",
          timeZone: "Asia/Yekaterinburg"
        },
        end: {
          dateTime: "2026-06-10T12:30:00+05:00",
          timeZone: "Asia/Yekaterinburg"
        },
        attendees: [
          { email: "reviewer@example.test" }
        ]
      }
    }
  ]);
});
