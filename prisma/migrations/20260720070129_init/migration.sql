-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EXPLORER', 'CURATOR', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "RejectionKind" AS ENUM ('OUT_OF_SCOPE', 'FIXABLE', 'DUPLICATE', 'ABUSE');

-- CreateEnum
CREATE TYPE "LocationStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AuState" AS ENUM ('NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT');

-- CreateEnum
CREATE TYPE "LocationCategory" AS ENUM ('BEACH', 'NATIONAL_PARK', 'WATERFALL', 'MOUNTAIN', 'LOOKOUT', 'UNIVERSITY', 'MUSEUM', 'HISTORIC_SITE', 'ZOO', 'CULTURAL_ATTRACTION', 'SPORTING_VENUE', 'MARKET', 'HIDDEN_GEM', 'OTHER');

-- CreateEnum
CREATE TYPE "MomentType" AS ENUM ('PHOTO', 'VIDEO', 'EXPERIENCE');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "MomentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('WORTH_IT', 'BEAUTIFUL', 'HELPFUL');

-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDING', 'APPROVED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('TOURISM_ORG', 'UNIVERSITY', 'MUSEUM', 'NATIONAL_PARK', 'ATTRACTION', 'ACCOMMODATION', 'CULTURAL_INSTITUTION', 'OTHER');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportTarget" AS ENUM ('LOCATION', 'MOMENT', 'CHAT_MESSAGE', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('INAPPROPRIATE', 'COPYRIGHT', 'WRONG_LOCATION', 'SPAM', 'SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ClusterStatus" AS ENUM ('OPEN', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('APPROVE', 'REJECT', 'REMOVE', 'RESTORE', 'CLAIM', 'RELEASE', 'EDIT', 'ROLE_GRANT', 'ROLE_REVOKE', 'VERIFY_GRANT', 'VERIFY_REVOKE', 'USER_SUSPEND', 'USER_REINSTATE', 'ESCALATE');

-- CreateEnum
CREATE TYPE "EscalationSeverity" AS ENUM ('URGENT', 'HIGH', 'NORMAL');

-- CreateEnum
CREATE TYPE "EscalationCategory" AS ENUM ('CSAM', 'CREDIBLE_THREAT', 'SELF_HARM', 'DOXXING', 'LEGAL_THREAT', 'CULTURAL_SENSITIVITY', 'JUDGEMENT_CALL', 'OTHER');

-- CreateEnum
CREATE TYPE "EscalationStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EXPLORER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedName" TEXT,
    "partnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "category" "LocationCategory" NOT NULL,
    "status" "LocationStatus" NOT NULL DEFAULT 'PENDING',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "state" "AuState" NOT NULL,
    "suburb" TEXT,
    "address" TEXT,
    "details" JSONB,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "ratingThreshold" INTEGER NOT NULL DEFAULT 20,
    "heroMediaId" TEXT,
    "submittedById" TEXT,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "rejectionKind" "RejectionKind",
    "rejectionReason" TEXT,
    "cooldownUntil" TIMESTAMP(3),
    "partnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Moment" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "MomentType" NOT NULL,
    "status" "MomentStatus" NOT NULL DEFAULT 'PENDING',
    "caption" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "rejectionKind" "RejectionKind",
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Moment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MomentMedia" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "mediaKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "mediaMeta" JSONB NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionKind" "RejectionKind",
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MomentMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "ReactionType" NOT NULL DEFAULT 'WORTH_IT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "userId" TEXT,
    "body" TEXT NOT NULL,
    "status" "ChatStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDING',
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityJoin" (
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityJoin_pkey" PRIMARY KEY ("activityId","userId")
);

-- CreateTable
CREATE TABLE "SavedLocation" (
    "userId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedLocation_pkey" PRIMARY KEY ("userId","locationId")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL,
    "website" TEXT,
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "claimedName" TEXT NOT NULL,
    "evidence" JSONB,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionKind" "RejectionKind",
    "notes" TEXT,
    "cooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "detail" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "locationId" TEXT,
    "momentId" TEXT,
    "chatMessageId" TEXT,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimExpiresAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationRequest" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "fromNearMe" BOOLEAN NOT NULL DEFAULT false,
    "hiddenByUser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LocationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationRequestCluster" (
    "id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" "ClusterStatus" NOT NULL DEFAULT 'OPEN',
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionKind" "RejectionKind",
    "rejectionReason" TEXT,
    "locationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationRequestCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" JSONB,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escalation" (
    "id" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "severity" "EscalationSeverity" NOT NULL,
    "category" "EscalationCategory" NOT NULL,
    "targetType" "ReportTarget" NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "status" "EscalationStatus" NOT NULL DEFAULT 'OPEN',
    "preserved" BOOLEAN NOT NULL DEFAULT false,
    "reportedTo" TEXT,
    "reportedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escalation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- CreateIndex
CREATE INDEX "Location_status_category_idx" ON "Location"("status", "category");

-- CreateIndex
CREATE INDEX "Location_status_state_idx" ON "Location"("status", "state");

-- CreateIndex
CREATE INDEX "Location_status_ratingAvg_idx" ON "Location"("status", "ratingAvg");

-- CreateIndex
CREATE INDEX "Location_status_claimExpiresAt_idx" ON "Location"("status", "claimExpiresAt");

-- CreateIndex
CREATE INDEX "Moment_locationId_status_isPublic_createdAt_idx" ON "Moment"("locationId", "status", "isPublic", "createdAt");

-- CreateIndex
CREATE INDEX "Moment_userId_createdAt_idx" ON "Moment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Moment_status_createdAt_idx" ON "Moment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Moment_status_claimExpiresAt_idx" ON "Moment"("status", "claimExpiresAt");

-- CreateIndex
CREATE INDEX "MomentMedia_momentId_status_position_idx" ON "MomentMedia"("momentId", "status", "position");

-- CreateIndex
CREATE INDEX "MomentMedia_status_createdAt_idx" ON "MomentMedia"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MomentMedia_momentId_position_key" ON "MomentMedia"("momentId", "position");

-- CreateIndex
CREATE INDEX "Reaction_momentId_idx" ON "Reaction"("momentId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_momentId_userId_key" ON "Reaction"("momentId", "userId");

-- CreateIndex
CREATE INDEX "Rating_locationId_idx" ON "Rating"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_locationId_userId_key" ON "Rating"("locationId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_locationId_createdAt_idx" ON "ChatMessage"("locationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_status_createdAt_idx" ON "ChatMessage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Activity_locationId_startsAt_idx" ON "Activity"("locationId", "startsAt");

-- CreateIndex
CREATE INDEX "Activity_status_startsAt_idx" ON "Activity"("status", "startsAt");

-- CreateIndex
CREATE INDEX "ActivityJoin_userId_idx" ON "ActivityJoin"("userId");

-- CreateIndex
CREATE INDEX "SavedLocation_userId_savedAt_idx" ON "SavedLocation"("userId", "savedAt");

-- CreateIndex
CREATE INDEX "Partner_type_isActive_idx" ON "Partner"("type", "isActive");

-- CreateIndex
CREATE INDEX "VerificationRequest_status_createdAt_idx" ON "VerificationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "VerificationRequest_userId_createdAt_idx" ON "VerificationRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Report_status_claimExpiresAt_idx" ON "Report"("status", "claimExpiresAt");

-- CreateIndex
CREATE INDEX "LocationRequest_clusterId_createdAt_idx" ON "LocationRequest"("clusterId", "createdAt");

-- CreateIndex
CREATE INDEX "LocationRequestCluster_status_requestCount_idx" ON "LocationRequestCluster"("status", "requestCount");

-- CreateIndex
CREATE INDEX "ModerationAudit_actorId_createdAt_idx" ON "ModerationAudit"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationAudit_targetType_targetId_idx" ON "ModerationAudit"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ModerationAudit_action_createdAt_idx" ON "ModerationAudit"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Escalation_status_severity_createdAt_idx" ON "Escalation"("status", "severity", "createdAt");

-- CreateIndex
CREATE INDEX "Escalation_raisedById_createdAt_idx" ON "Escalation"("raisedById", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Moment" ADD CONSTRAINT "Moment_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomentMedia" ADD CONSTRAINT "MomentMedia_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityJoin" ADD CONSTRAINT "ActivityJoin_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityJoin" ADD CONSTRAINT "ActivityJoin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedLocation" ADD CONSTRAINT "SavedLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedLocation" ADD CONSTRAINT "SavedLocation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "Moment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_chatMessageId_fkey" FOREIGN KEY ("chatMessageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_claimedById_fkey" FOREIGN KEY ("claimedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationRequest" ADD CONSTRAINT "LocationRequest_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "LocationRequestCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationRequestCluster" ADD CONSTRAINT "LocationRequestCluster_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationRequestCluster" ADD CONSTRAINT "LocationRequestCluster_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAudit" ADD CONSTRAINT "ModerationAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escalation" ADD CONSTRAINT "Escalation_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
