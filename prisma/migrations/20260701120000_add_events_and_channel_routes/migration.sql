-- CreateEnum
CREATE TYPE "EventCategory" AS ENUM ('EXAM', 'CLASS_TEST', 'QUIZ', 'ASSIGNMENT', 'PROJECT', 'PRESENTATION', 'LAB_REPORT', 'DEADLINE', 'NOTICE', 'MEETUP', 'PAYMENT', 'HOLIDAY', 'OTHER');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "category" "EventCategory" NOT NULL,
    "courseId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelRoute" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,

    CONSTRAINT "ChannelRoute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_spaceId_date_idx" ON "Event"("spaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelRoute_spaceId_key_key" ON "ChannelRoute"("spaceId", "key");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "ScheduleSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelRoute" ADD CONSTRAINT "ChannelRoute_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "ScheduleSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
