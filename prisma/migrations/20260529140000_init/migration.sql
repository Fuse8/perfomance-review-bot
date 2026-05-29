-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "ReviewerToken" (
    "chatUserId" TEXT NOT NULL,
    "googleUserEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewerToken_pkey" PRIMARY KEY ("chatUserId")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "state" TEXT NOT NULL,
    "chatUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("state")
);

-- CreateTable
CREATE TABLE "PendingReview" (
    "chatUserId" TEXT NOT NULL,
    "reviewMonth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT NOT NULL,
    "employeeEmail" TEXT NOT NULL,
    "reviewDate" TEXT NOT NULL,
    "meetingTime" TEXT NOT NULL,
    "needsClientForm" BOOLEAN NOT NULL,

    CONSTRAINT "PendingReview_pkey" PRIMARY KEY ("chatUserId")
);
