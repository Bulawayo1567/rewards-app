-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "judgemeToken" TEXT,
ADD COLUMN     "mailchimpApiKey" TEXT,
ADD COLUMN     "mailchimpAudienceId" TEXT,
ADD COLUMN     "mailchimpEnabled" BOOLEAN NOT NULL DEFAULT false;
