CREATE TABLE "webhook_event_receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" TEXT NOT NULL,
  "event_key" TEXT NOT NULL,
  "request_id" TEXT,
  "payload_sha256" TEXT,
  "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_event_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_event_receipts_provider_event_key_key"
  ON "webhook_event_receipts"("provider", "event_key");

CREATE INDEX "webhook_event_receipts_provider_processed_at_idx"
  ON "webhook_event_receipts"("provider", "processed_at");
