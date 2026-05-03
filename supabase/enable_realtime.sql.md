# Supabase Realtime Configuration

This query enables Realtime broadcasting for the `job_events` table. This is required for the "Live Terminal" logs to show up on the frontend.

## SQL Query

Run this in the Supabase SQL Editor:

```sql
-- 1. Create the publication if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END
$$;

-- 2. Add the job_events table to the publication
-- We use a DO block here to handle the case where it might already be added
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE job_events;
EXCEPTION
    WHEN duplicate_object THEN
        NULL; -- Table already exists in publication
END
$$;

-- 3. Ensure the table sends the full data for each update
ALTER TABLE job_events REPLICA IDENTITY FULL;
```

## When to use this
- After a database reset or fresh migration.
- If the frontend "Live Logs" stop updating in real-time.
- If the `supabase_realtime` publication is missing from the Supabase Dashboard Replication tab.
