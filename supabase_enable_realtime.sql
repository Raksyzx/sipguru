-- ============================================
-- SIPGURU - Enable Supabase Realtime
-- Tables: grade_schedules, qr_tokens, attendance_logs
-- ============================================

-- 1. Enable Realtime for grade_schedules
BEGIN;
ALTER PUBLICATION supabase_realtime ADD TABLE grade_schedules;
COMMIT;

-- 2. Enable Realtime for qr_tokens
BEGIN;
ALTER PUBLICATION supabase_realtime ADD TABLE qr_tokens;
COMMIT;

-- 3. Enable Realtime for attendance_logs
BEGIN;
ALTER PUBLICATION supabase_realtime ADD TABLE attendance_logs;
COMMIT;

-- 4. Verify realtime is enabled
SELECT schemaname, tablename, pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('grade_schedules', 'qr_tokens', 'attendance_logs')
ORDER BY tablename;

-- ============================================
-- Usage in ESP32/Client:
-- ============================================
-- Channel: realtime:grade_schedules
-- Event: INSERT, UPDATE, DELETE
-- Filter: room_id = eq.{room_id}
--
-- Channel: realtime:qr_tokens
-- Event: UPDATE
-- Filter: schedule_id = eq.{schedule_id} AND state = IN.(active,ended,absent)
--
-- Channel: realtime:attendance_logs
-- Event: INSERT
-- Filter: room_id = eq.{room_id}
-- ============================================
