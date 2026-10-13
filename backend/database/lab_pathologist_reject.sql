-- Extend lab_results for pathologist REJECTED workflow
ALTER TABLE lab_results DROP CONSTRAINT IF EXISTS lab_results_status_check;
ALTER TABLE lab_results ADD CONSTRAINT lab_results_status_check
  CHECK (status IN (
    'PENDING',
    'PROCESSING',
    'DRAFT',
    'TECHNICIAN_APPROVED',
    'PATHOLOGIST_APPROVED',
    'PATHOLOGIST_VERIFIED',
    'RERUN_REQUESTED',
    'REJECTED'
  ));

ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS pathologist_rejection_note TEXT NULL;
