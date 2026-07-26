-- Let a contributor DISMISS a removed/rejected moment from their own dashboard.
-- A hide, not a delete (mirrors LocationRequest.hiddenByUser): the moment's
-- status, files, and ModerationAudit trail are untouched. Default false so
-- every existing moment stays visible in its owner's list.
ALTER TABLE "Moment" ADD COLUMN "dismissedByUser" BOOLEAN NOT NULL DEFAULT false;
