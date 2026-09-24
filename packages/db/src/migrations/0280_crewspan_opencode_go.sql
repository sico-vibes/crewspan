ALTER TABLE "ai_connection_defaults" DROP CONSTRAINT IF EXISTS "ai_connection_defaults_provider_check";
--> statement-breakpoint
ALTER TABLE "ai_connection_defaults" ADD CONSTRAINT "ai_connection_defaults_provider_check" CHECK ("provider" in ('anthropic','openai','openrouter','opencode-go','xai'));
--> statement-breakpoint
ALTER TABLE "ai_provider_defaults" DROP CONSTRAINT IF EXISTS "ai_provider_defaults_provider_check";
--> statement-breakpoint
ALTER TABLE "ai_provider_defaults" ADD CONSTRAINT "ai_provider_defaults_provider_check" CHECK ("provider" in ('anthropic','openai','openrouter','opencode-go','xai'));
