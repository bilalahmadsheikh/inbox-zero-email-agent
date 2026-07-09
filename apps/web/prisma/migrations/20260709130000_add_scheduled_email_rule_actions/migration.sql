-- Rule actions operating on the ScheduledEmail queue
ALTER TYPE "ActionType" ADD VALUE 'CANCEL_SCHEDULED';
ALTER TYPE "ActionType" ADD VALUE 'SEND_SCHEDULED';
