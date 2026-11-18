-- Migration: Normalize day_of_week to canonical Indonesian names.
-- Targets both grade_schedules and the legacy schedules table.
-- Run as one transaction. Any unsupported or NULL value aborts and rolls back.

BEGIN;

-- Block concurrent writes while constraints and stored values are changed.
LOCK TABLE grade_schedules, schedules IN ACCESS EXCLUSIVE MODE;

-- Drop every CHECK constraint that references day_of_week, including custom names.
-- This must happen before converting English values to Indonesian values.
DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT c.conrelid::regclass AS table_name, c.conname AS constraint_name
    FROM pg_constraint AS c
    JOIN pg_class AS t ON t.oid = c.conrelid
    JOIN pg_namespace AS n ON n.oid = t.relnamespace
    WHERE c.contype = 'c'
      AND n.nspname = current_schema()
      AND t.relname IN ('grade_schedules', 'schedules')
      AND pg_get_constraintdef(c.oid) ILIKE '%day_of_week%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I',
                   constraint_row.table_name, constraint_row.constraint_name);
  END LOOP;
END $$;

-- Normalize recognized English and Indonesian spellings, ignoring case and
-- surrounding whitespace. Unknown values are left unchanged to be rejected below.
UPDATE grade_schedules
SET day_of_week = CASE LOWER(BTRIM(day_of_week))
  WHEN 'monday' THEN 'Senin' WHEN 'senin' THEN 'Senin'
  WHEN 'tuesday' THEN 'Selasa' WHEN 'selasa' THEN 'Selasa'
  WHEN 'wednesday' THEN 'Rabu' WHEN 'rabu' THEN 'Rabu'
  WHEN 'thursday' THEN 'Kamis' WHEN 'kamis' THEN 'Kamis'
  WHEN 'friday' THEN 'Jumat' WHEN 'jumat' THEN 'Jumat'
  WHEN 'saturday' THEN 'Sabtu' WHEN 'sabtu' THEN 'Sabtu'
  WHEN 'sunday' THEN 'Minggu' WHEN 'minggu' THEN 'Minggu'
  ELSE day_of_week
END;

UPDATE schedules
SET day_of_week = CASE LOWER(BTRIM(day_of_week))
  WHEN 'monday' THEN 'Senin' WHEN 'senin' THEN 'Senin'
  WHEN 'tuesday' THEN 'Selasa' WHEN 'selasa' THEN 'Selasa'
  WHEN 'wednesday' THEN 'Rabu' WHEN 'rabu' THEN 'Rabu'
  WHEN 'thursday' THEN 'Kamis' WHEN 'kamis' THEN 'Kamis'
  WHEN 'friday' THEN 'Jumat' WHEN 'jumat' THEN 'Jumat'
  WHEN 'saturday' THEN 'Sabtu' WHEN 'sabtu' THEN 'Sabtu'
  WHEN 'sunday' THEN 'Minggu' WHEN 'minggu' THEN 'Minggu'
  ELSE day_of_week
END;

-- Reject unsupported and NULL values before adding canonical constraints.
DO $$
DECLARE
  invalid_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM grade_schedules
  WHERE day_of_week IS NULL
     OR day_of_week NOT IN ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu');
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'grade_schedules has % unrecognized or NULL day_of_week value(s)', invalid_count;
  END IF;

  SELECT COUNT(*) INTO invalid_count
  FROM schedules
  WHERE day_of_week IS NULL
     OR day_of_week NOT IN ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu');
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'schedules has % unrecognized or NULL day_of_week value(s)', invalid_count;
  END IF;
END $$;

ALTER TABLE grade_schedules ALTER COLUMN day_of_week SET NOT NULL;
ALTER TABLE grade_schedules ADD CONSTRAINT grade_schedules_day_of_week_check
  CHECK (day_of_week IN ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'));

ALTER TABLE schedules ALTER COLUMN day_of_week SET NOT NULL;
ALTER TABLE schedules ADD CONSTRAINT schedules_day_of_week_check
  CHECK (day_of_week IN ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'));

COMMIT;
