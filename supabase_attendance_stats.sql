-- Supabase RPC Function: Fast Attendance Stats
-- Usage: SELECT * FROM get_attendance_stats('2026-11-01', '2026-11-32');

CREATE OR REPLACE FUNCTION get_attendance_stats(
    target_month DATE,
    target_end DATE
)
RETURNS TABLE (
    total_count BIGINT,
    on_time_count BIGINT,
    late_count BIGINT,
    absent_count BIGINT,
    deferred_count BIGINT,
    approved_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) FILTER (WHERE created_at >= target_month AND created_at < target_end)::BIGINT as total_count,
        COUNT(*) FILTER (WHERE status = 'on_time' AND created_at >= target_month AND created_at < target_end)::BIGINT as on_time_count,
        COUNT(*) FILTER (WHERE status = 'late' AND created_at >= target_month AND created_at < target_end)::BIGINT as late_count,
        COUNT(*) FILTER (WHERE status = 'absent' AND created_at >= target_month AND created_at < target_end)::BIGINT as absent_count,
        COUNT(*) FILTER (WHERE status = 'deferred' AND created_at >= target_month AND created_at < target_end)::BIGINT as deferred_count,
        COUNT(*) FILTER (WHERE status = 'approved' AND created_at >= target_month AND created_at < target_end)::BIGINT as approved_count
    FROM attendance_logs;
END;
$$ LANGUAGE plpgsql;
