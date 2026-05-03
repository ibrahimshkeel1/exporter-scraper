-- Check if the publication exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

-- Add the job_events table to the publication
ALTER PUBLICATION supabase_realtime ADD TABLE job_events;

-- Ensure the table has the correct replica identity to send data
ALTER TABLE job_events REPLICA IDENTITY FULL;
