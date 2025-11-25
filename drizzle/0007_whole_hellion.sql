ALTER TABLE `organizations` ADD `normalized_name` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `organizations` SET `normalized_name` = lower(trim(`name`));--> statement-breakpoint
DELETE FROM `organizations`
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM `organizations`
  GROUP BY `user_id`, `normalized_name`
);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_organizations_user_normalized_name` ON `organizations` (`user_id`,`normalized_name`);--> statement-breakpoint
ALTER TABLE `repositories` ADD `normalized_full_name` text NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `repositories` SET `normalized_full_name` = lower(trim(`full_name`));--> statement-breakpoint
DELETE FROM `repositories`
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM `repositories`
  GROUP BY `user_id`, `normalized_full_name`
);--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_repositories_user_normalized_full_name` ON `repositories` (`user_id`,`normalized_full_name`);
