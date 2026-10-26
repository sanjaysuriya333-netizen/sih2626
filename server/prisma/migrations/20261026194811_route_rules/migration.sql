-- CreateTable
CREATE TABLE "route_rules" (
    "id" SERIAL NOT NULL,
    "priority" INTEGER NOT NULL,
    "route_id" INTEGER NOT NULL,
    "institution_types" "InstitutionType"[],
    "new_or_existing" "NewOrExisting"[],
    "programme_levels" "ProgrammeLevel"[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "route_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "route_rules_priority_key" ON "route_rules"("priority");

-- AddForeignKey
ALTER TABLE "route_rules" ADD CONSTRAINT "route_rules_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
