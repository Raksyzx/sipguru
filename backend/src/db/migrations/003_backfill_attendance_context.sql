-- Backfill attendance_context untuk log lama
-- Ini mengisi subject_name, grade_name, jurusan_name, jurusan_code dari jadwal
-- untuk presensi yang dilakukan sebelum fitur ini ada (sebelum 2026-11-18)

-- Catatan: Migration ini hanya untuk data lama yang attendance_context-nya
-- tidak punya field subject_name/grade_name/jurusan_name/jurusan_code

BEGIN;

-- Update attendance_context untuk log yang punya schedule_id
-- tapi tidak punya subject_name (artinya log lama sebelum backfill)
UPDATE attendance_logs
SET attendance_context = json_object(
    'schedule_id', json_extract(attendance_context, '$.schedule_id'),
    'grade_id', (
        SELECT gs.grade_id 
        FROM grade_schedules gs 
        WHERE gs.id = json_extract(attendance_logs.attendance_context, '$.schedule_id')
    ),
    'grade_name', (
        SELECT g.name 
        FROM grades g 
        INNER JOIN grade_schedules gs ON g.id = gs.grade_id
        WHERE gs.id = json_extract(attendance_logs.attendance_context, '$.schedule_id')
    ),
    'subject_id', (
        SELECT gs.subject_id 
        FROM grade_schedules gs 
        WHERE gs.id = json_extract(attendance_logs.attendance_context, '$.schedule_id')
    ),
    'subject_name', (
        SELECT s.name 
        FROM subjects s 
        INNER JOIN grade_schedules gs ON s.id = gs.subject_id
        WHERE gs.id = json_extract(attendance_logs.attendance_context, '$.schedule_id')
    ),
    'jurusan_id', (
        SELECT g.jurusan_id 
        FROM grades g 
        INNER JOIN grade_schedules gs ON g.id = gs.grade_id
        WHERE gs.id = json_extract(attendance_logs.attendance_context, '$.schedule_id')
    ),
    'jurusan_name', (
        SELECT j.name 
        FROM jurusan j 
        INNER JOIN grades g ON j.id = g.jurusan_id
        INNER JOIN grade_schedules gs ON g.id = gs.grade_id
        WHERE gs.id = json_extract(attendance_logs.attendance_context, '$.schedule_id')
    ),
    'jurusan_code', (
        SELECT j.code 
        FROM jurusan j 
        INNER JOIN grades g ON j.id = g.jurusan_id
        INNER JOIN grade_schedules gs ON g.id = gs.grade_id
        WHERE gs.id = json_extract(attendance_logs.attendance_context, '$.schedule_id')
    ),
    'token_type', COALESCE(
        json_extract(attendance_context, '$.token_type'),
        'entry'
    ),
    'lateness_minutes', COALESCE(
        json_extract(attendance_context, '$.lateness_minutes'),
        0
    )
)
WHERE attendance_context IS NOT NULL
  AND json_extract(attendance_context, '$.schedule_id') IS NOT NULL
  AND (
    json_extract(attendance_context, '$.subject_name') IS NULL
    OR json_extract(attendance_context, '$.grade_name') IS NULL
    OR json_extract(attendance_context, '$.jurusan_code') IS NULL
  );

COMMIT;

