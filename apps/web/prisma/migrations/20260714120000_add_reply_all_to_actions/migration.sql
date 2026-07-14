-- REPLY actions can address all original recipients instead of just the sender
ALTER TABLE "Action" ADD COLUMN "replyAll" BOOLEAN;
ALTER TABLE "ExecutedAction" ADD COLUMN "replyAll" BOOLEAN;
