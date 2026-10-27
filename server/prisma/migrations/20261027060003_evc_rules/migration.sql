-- CreateTable
CREATE TABLE "evc_rules" (
    "id" SERIAL NOT NULL,
    "min_notice_days" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "evc_rules_pkey" PRIMARY KEY ("id")
);
