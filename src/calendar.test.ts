import assert from "node:assert/strict";
import test from "node:test";
import { createCalendarEventInCalendar } from "./calendar.js";

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
    htmlLink: "https://calendar.google.com/event?eid=event-id"
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
