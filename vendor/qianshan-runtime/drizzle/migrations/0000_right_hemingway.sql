CREATE TABLE `operation_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`module` text NOT NULL,
	`action` text NOT NULL,
	`detail` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `competitor_contents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competitor_id` integer NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`like_count` integer DEFAULT 0,
	`comment_count` integer DEFAULT 0,
	`share_count` integer DEFAULT 0,
	`published_at` text,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `competitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`account_name` text NOT NULL,
	`account_id` text,
	`avatar_url` text,
	`follower_count` integer DEFAULT 0,
	`notes` text,
	`is_active` integer DEFAULT 1,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_calendar` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`topic_id` integer,
	`title` text NOT NULL,
	`platform` text NOT NULL,
	`status` text DEFAULT 'planned',
	`notes` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `topic_analyses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`topic_id` integer NOT NULL,
	`angles` text NOT NULL,
	`target_audience` text,
	`content_suggestions` text,
	`competition_level` text DEFAULT 'medium',
	`score` integer DEFAULT 0,
	`llm_model` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`keyword` text NOT NULL,
	`heat_score` integer DEFAULT 0,
	`category` text,
	`trend` text DEFAULT 'stable',
	`raw_data` text,
	`fetched_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `copywriting_adaptations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`copywriting_id` integer NOT NULL,
	`platform` text NOT NULL,
	`adapted_text` text NOT NULL,
	`adapted_title` text,
	`tags` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`copywriting_id`) REFERENCES `copywritings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `copywritings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`topic` text NOT NULL,
	`platform` text NOT NULL,
	`outline` text,
	`scenes` text,
	`final_text` text,
	`subtitles` text,
	`word_count` integer DEFAULT 0,
	`generation_mode` text NOT NULL,
	`status` text DEFAULT 'draft',
	`llm_model` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`platform` text NOT NULL,
	`structure` text NOT NULL,
	`example_text` text,
	`usage_count` integer DEFAULT 0,
	`is_builtin` integer DEFAULT 0,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `title_candidates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`copywriting_id` integer NOT NULL,
	`title_text` text NOT NULL,
	`style` text NOT NULL,
	`score` integer DEFAULT 0,
	`is_selected` integer DEFAULT 0,
	`created_at` text NOT NULL,
	FOREIGN KEY (`copywriting_id`) REFERENCES `copywritings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ad_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_image_path` text NOT NULL,
	`creative_desc` text NOT NULL,
	`expanded_prompt` text,
	`en_prompt` text,
	`kling_task_id` text,
	`video_url` text,
	`video_local_path` text,
	`duration` integer DEFAULT 5,
	`status` text DEFAULT 'pending',
	`error_msg` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bgm_library` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`file_path` text NOT NULL,
	`duration` integer NOT NULL,
	`mood` text DEFAULT 'neutral',
	`bpm` integer,
	`is_builtin` integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE `cover_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`layout_config` text NOT NULL,
	`preview_path` text,
	`is_builtin` integer DEFAULT 0,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `covers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`template_id` integer,
	`background_path` text,
	`output_path` text,
	`platform` text NOT NULL,
	`resolution` text DEFAULT '1280x720',
	`created_at` text NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `cover_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `slideshow_videos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`images` text NOT NULL,
	`script_text` text,
	`tts_audio_path` text,
	`bgm_id` integer,
	`output_path` text,
	`resolution` text DEFAULT '1080x1920',
	`duration` integer DEFAULT 0,
	`status` text DEFAULT 'draft',
	`created_at` text NOT NULL,
	FOREIGN KEY (`bgm_id`) REFERENCES `bgm_library`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content_metrics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`publish_task_id` integer NOT NULL,
	`views` integer DEFAULT 0,
	`likes` integer DEFAULT 0,
	`comments` integer DEFAULT 0,
	`shares` integer DEFAULT 0,
	`followers_gained` integer DEFAULT 0,
	`fetched_at` text NOT NULL,
	FOREIGN KEY (`publish_task_id`) REFERENCES `publish_tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platform_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`account_name` text NOT NULL,
	`cookie_data` text,
	`access_token` text,
	`is_active` integer DEFAULT 1,
	`last_login_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publish_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`cron_expr` text,
	`time_slots` text NOT NULL,
	`is_active` integer DEFAULT 1,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publish_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`suggested_time` text NOT NULL,
	`reason` text,
	`confidence` integer DEFAULT 50,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publish_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`platform` text NOT NULL,
	`content_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`media_paths` text,
	`tags` text,
	`cover_path` text,
	`scheduled_at` text,
	`published_at` text,
	`status` text DEFAULT 'draft',
	`platform_post_id` text,
	`error_msg` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `platform_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `generation_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_type` text NOT NULL,
	`source_id` integer NOT NULL,
	`variant_index` integer NOT NULL,
	`content` text NOT NULL,
	`is_selected` integer DEFAULT 0,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `style_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`module` text NOT NULL,
	`config` text NOT NULL,
	`is_builtin` integer DEFAULT 0,
	`created_at` text NOT NULL
);
