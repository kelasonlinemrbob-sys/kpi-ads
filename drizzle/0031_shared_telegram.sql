CREATE TABLE "shared_telegram_connection" (
	"id" integer PRIMARY KEY NOT NULL,
	"updated_by_id" integer,
	"token" text NOT NULL,
	"bot_name" text NOT NULL,
	"chat_id" varchar(40) NOT NULL,
	"chat_title" text NOT NULL,
	"thread_id" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_send" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_telegram_connection" ADD CONSTRAINT "shared_telegram_connection_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Preserve a single existing supervisor destination. Ambiguous configurations require explicit setup.
INSERT INTO shared_telegram_connection (id, updated_by_id, token, bot_name, chat_id, chat_title, thread_id, enabled, auto_send, version, updated_at)
SELECT 1, t.user_id, t.token, t.bot_name, t.chat_id, t.chat_title, t.thread_id, t.enabled, t.auto_send, t.version + 1, now()
FROM telegram_connections t JOIN users u ON u.id = t.user_id
WHERE u.role = 'supervisor' AND u.is_active AND t.enabled
AND (SELECT count(*) FROM telegram_connections c JOIN users m ON m.id = c.user_id WHERE m.role = 'supervisor' AND m.is_active AND c.enabled) = 1;
--> statement-breakpoint
-- Never redirect a queued private message to a new shared destination.
UPDATE telegram_outbox SET status = 'cancelled', error = 'Integrasi Telegram beralih ke konfigurasi bersama. Antrean pribadi lama dibatalkan.' WHERE status = 'pending';
--> statement-breakpoint
UPDATE telegram_outbox SET status = 'unknown', error = 'Peralihan integrasi. Periksa pengiriman terakhir di Telegram.' WHERE status = 'sending';
