-- Step 1: Remove duplicate repositories, keeping the most recently updated one
-- This handles cases where users have duplicate entries from before the unique constraint
DELETE FROM repositories
WHERE rowid NOT IN (
  SELECT MAX(rowid)
  FROM repositories
  GROUP BY user_id, full_name
);
--> statement-breakpoint
-- Step 2: Now create the unique index safely
CREATE UNIQUE INDEX uniq_repositories_user_full_name ON repositories (user_id, full_name);