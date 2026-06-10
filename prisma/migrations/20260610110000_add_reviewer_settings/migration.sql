CREATE TABLE "ReviewerSettings" (
    "chatUserId" TEXT NOT NULL,
    "rootFolderId" TEXT NOT NULL,
    "taskCollectDaysBefore" INTEGER NOT NULL,
    "taskCheckDaysBefore" INTEGER NOT NULL,
    "taskPrepareDaysBefore" INTEGER NOT NULL,
    "taskReminderTime" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewerSettings_pkey" PRIMARY KEY ("chatUserId")
);
