-- Add video_url column to Provider table for embedded video links
ALTER TABLE "Provider"
  ADD COLUMN "video_url" TEXT;
