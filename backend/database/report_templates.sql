-- Report templates + parameterized normal ranges (gender/age aware)

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS tests (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, department_id, name)
);

-- Global parameter catalog (reusable across tests).
CREATE TABLE IF NOT EXISTS parameters (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NULL,
  value_type TEXT NOT NULL DEFAULT 'NUMERIC' CHECK (value_type IN ('NUMERIC', 'TEXT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Keep names non-unique (labs may have same parameter name with different units/contexts).
  -- If you want stricter rules, enforce in app logic.
  UNIQUE (tenant_id, id)
);

-- Many-to-many assignment of parameters to tests (with ordering).
CREATE TABLE IF NOT EXISTS test_parameter_assignments (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES parameters(id) ON DELETE CASCADE,
  sort_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, test_id, parameter_id)
);

CREATE INDEX IF NOT EXISTS idx_test_parameter_assignments_test
  ON test_parameter_assignments (tenant_id, test_id, sort_index, parameter_id);

CREATE TABLE IF NOT EXISTS parameter_normal_ranges (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  parameter_id UUID NOT NULL REFERENCES parameters(id) ON DELETE CASCADE,
  gender TEXT NOT NULL DEFAULT 'ALL' CHECK (gender IN ('ALL', 'MALE', 'FEMALE', 'OTHER')),
  age_min INT NULL CHECK (age_min >= 0),
  age_max INT NULL CHECK (age_max >= 0),
  normal_min NUMERIC NULL,
  normal_max NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One rule per "slice" to prevent accidental duplicates.
  UNIQUE (tenant_id, parameter_id, gender, age_min, age_max)
);

CREATE INDEX IF NOT EXISTS idx_parameter_normal_ranges_lookup
  ON parameter_normal_ranges (tenant_id, parameter_id, gender, age_min, age_max);

CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  template_type TEXT NOT NULL CHECK (template_type IN ('STANDARD', 'DETAILED')),
  name TEXT NOT NULL,
  show_reference_range BOOLEAN NOT NULL DEFAULT TRUE,
  auto_bold_abnormal BOOLEAN NOT NULL DEFAULT TRUE,
  group_by_test BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, template_type)
);

CREATE TABLE IF NOT EXISTS report_template_items (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  parameter_id UUID NOT NULL REFERENCES parameters(id) ON DELETE CASCADE,
  sort_index INT NOT NULL,
  show_reference_range_override BOOLEAN NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, template_id, parameter_id)
);

CREATE INDEX IF NOT EXISTS idx_report_template_items_template ON report_template_items (tenant_id, template_id, sort_index);

