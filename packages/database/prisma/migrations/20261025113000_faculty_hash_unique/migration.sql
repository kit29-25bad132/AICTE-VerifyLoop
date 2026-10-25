-- Enforce one PAN hash per institution for cross-document faculty checks.
CREATE UNIQUE INDEX "FacultyHash_institutionId_panHash_key"
ON "FacultyHash"("institutionId", "panHash");
