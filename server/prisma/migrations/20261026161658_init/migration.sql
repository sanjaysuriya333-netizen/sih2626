-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OFFICER', 'SUPERVISOR', 'HEAD_OFFICE', 'INSTITUTION');

-- CreateEnum
CREATE TYPE "ObligationKind" AS ENUM ('STAGE', 'EVC', 'UNDERTAKING', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "ObligationState" AS ENUM ('OPEN', 'REMINDER_SENT', 'DUE_TODAY', 'OVERDUE', 'ESCALATED', 'REPORTED', 'DONE');

-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('GOVERNMENT', 'PRIVATE', 'AUTONOMOUS');

-- CreateEnum
CREATE TYPE "NewOrExisting" AS ENUM ('NEW', 'EXISTING');

-- CreateEnum
CREATE TYPE "ProgrammeLevel" AS ENUM ('UG', 'PG', 'DIPLOMA');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('IN_PROGRESS', 'APPROVED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "EvcStatus" AS ENUM ('PLANNED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UndertakingStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProofOwnerType" AS ENUM ('UNDERTAKING', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "VerifiedStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('VALID', 'EXPIRED', 'REPLACED');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'IN_APP', 'SMS');

-- CreateEnum
CREATE TYPE "RecipientRole" AS ENUM ('OWNER', 'SUPERVISOR', 'HEAD_OFFICE');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "region" TEXT,
    "supervisor_id" INTEGER,
    "institution_id" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "institution_type" "InstitutionType" NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routes" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stages" (
    "id" SERIAL NOT NULL,
    "route_id" INTEGER NOT NULL,
    "stage_name" TEXT NOT NULL,
    "order_no" INTEGER NOT NULL,
    "max_days" INTEGER NOT NULL,
    "owner_role" "Role" NOT NULL,

    CONSTRAINT "route_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" SERIAL NOT NULL,
    "app_code" TEXT NOT NULL,
    "institution_id" INTEGER NOT NULL,
    "route_id" INTEGER,
    "current_stage_id" INTEGER,
    "assigned_officer_id" INTEGER,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "new_or_existing" "NewOrExisting" NOT NULL,
    "programme_level" "ProgrammeLevel" NOT NULL,
    "submitted_on" TIMESTAMP(3) NOT NULL,
    "closed_on" TIMESTAMP(3),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_history" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "stage_id" INTEGER NOT NULL,
    "entered_on" TIMESTAMP(3) NOT NULL,
    "completed_on" TIMESTAMP(3),
    "completed_by" INTEGER,

    CONSTRAINT "stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evc_visits" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "planned_date" TIMESTAMP(3) NOT NULL,
    "actual_date" TIMESTAMP(3),
    "status" "EvcStatus" NOT NULL DEFAULT 'PLANNED',
    "committee_notes" TEXT,

    CONSTRAINT "evc_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "undertakings" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "UndertakingStatus" NOT NULL DEFAULT 'PENDING',
    "verified_by" INTEGER,
    "closed_on" TIMESTAMP(3),

    CONSTRAINT "undertakings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proofs" (
    "id" SERIAL NOT NULL,
    "owner_type" "ProofOwnerType" NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "file_path" TEXT NOT NULL,
    "uploaded_by" INTEGER NOT NULL,
    "uploaded_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_status" "VerifiedStatus" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,

    CONSTRAINT "proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" SERIAL NOT NULL,
    "application_id" INTEGER NOT NULL,
    "doc_type" TEXT NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'VALID',

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligations" (
    "id" SERIAL NOT NULL,
    "kind" "ObligationKind" NOT NULL,
    "ref_id" INTEGER,
    "application_id" INTEGER NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "state" "ObligationState" NOT NULL DEFAULT 'OPEN',
    "last_alert_level" INTEGER NOT NULL DEFAULT 0,
    "closed_on" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" SERIAL NOT NULL,
    "kind" "ObligationKind" NOT NULL,
    "days_before" INTEGER NOT NULL,
    "level" "ObligationState" NOT NULL,
    "channel" "Channel" NOT NULL,
    "recipient_role" "RecipientRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "channel" "Channel" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sent_on" TIMESTAMP(3),
    "read_on" TIMESTAMP(3),
    "obligation_id" INTEGER,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER,
    "before_json" JSONB,
    "after_json" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "routes_name_key" ON "routes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "route_stages_route_id_order_no_key" ON "route_stages"("route_id", "order_no");

-- CreateIndex
CREATE UNIQUE INDEX "applications_app_code_key" ON "applications"("app_code");

-- CreateIndex
CREATE INDEX "applications_assigned_officer_id_status_idx" ON "applications"("assigned_officer_id", "status");

-- CreateIndex
CREATE INDEX "obligations_due_date_state_idx" ON "obligations"("due_date", "state");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_date_key" ON "holidays"("date");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stages" ADD CONSTRAINT "route_stages_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "route_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_assigned_officer_id_fkey" FOREIGN KEY ("assigned_officer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "route_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_history" ADD CONSTRAINT "stage_history_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evc_visits" ADD CONSTRAINT "evc_visits_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "undertakings" ADD CONSTRAINT "undertakings_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "undertakings" ADD CONSTRAINT "undertakings_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_obligation_id_fkey" FOREIGN KEY ("obligation_id") REFERENCES "obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
