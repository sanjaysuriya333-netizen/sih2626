/*
  Warnings:

  - A unique constraint covering the columns `[replaced_by_id]` on the table `documents` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "closed_on" TIMESTAMP(3),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "replaced_by_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "documents_replaced_by_id_key" ON "documents"("replaced_by_id");

-- CreateIndex
CREATE INDEX "documents_application_id_status_idx" ON "documents"("application_id", "status");

-- CreateIndex
CREATE INDEX "documents_valid_until_status_idx" ON "documents"("valid_until", "status");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
