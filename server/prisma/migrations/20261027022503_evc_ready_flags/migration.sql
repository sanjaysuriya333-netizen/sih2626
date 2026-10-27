-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "evc_ready_on" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "route_stages" ADD COLUMN     "is_evc_entry" BOOLEAN NOT NULL DEFAULT false;
