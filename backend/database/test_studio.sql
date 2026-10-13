-- No-code Test Parameter Studio extensions

ALTER TABLE parameters ADD COLUMN IF NOT EXISTS input_type TEXT NOT NULL DEFAULT 'NUMERIC';
ALTER TABLE parameters ADD COLUMN IF NOT EXISTS dropdown_options JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill input_type from value_type / formula where applicable
UPDATE parameters SET input_type = 'TEXT' WHERE value_type = 'TEXT' AND input_type = 'NUMERIC';
UPDATE parameters SET input_type = 'FORMULA' WHERE formula IS NOT NULL AND TRIM(formula) <> '' AND input_type = 'NUMERIC';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parameters_input_type_check'
  ) THEN
    ALTER TABLE parameters ADD CONSTRAINT parameters_input_type_check
      CHECK (input_type IN ('NUMERIC', 'DROPDOWN', 'TEXT', 'FORMULA'));
  END IF;
END $$;
