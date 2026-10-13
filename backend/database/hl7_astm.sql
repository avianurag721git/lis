-- Analyzer interface: parameter analyzer codes for OBX-3 / ASTM R mapping

ALTER TABLE parameters ADD COLUMN IF NOT EXISTS analyzer_code TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_parameters_analyzer_code
  ON parameters (tenant_id, analyzer_code)
  WHERE analyzer_code IS NOT NULL;

-- Seed analyzer_code from formula_alias when present
UPDATE parameters
SET analyzer_code = UPPER(NULLIF(TRIM(formula_alias), ''))
WHERE analyzer_code IS NULL AND formula_alias IS NOT NULL AND TRIM(formula_alias) <> '';
