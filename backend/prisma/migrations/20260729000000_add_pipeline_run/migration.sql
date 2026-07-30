-- CreateTable
CREATE TABLE pipeline_runs (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP(3),
    heartbeat_at TIMESTAMP(3),
    profiles_scanned INTEGER NOT NULL DEFAULT 0,
    profiles_matched INTEGER NOT NULL DEFAULT 0,
    profiles_imported INTEGER NOT NULL DEFAULT 0,
    photos_synced INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB,

    CONSTRAINT pipeline_runs_pkey PRIMARY KEY (id)
);

-- CreateIndex
CREATE INDEX pipeline_runs_source_started_at_idx ON pipeline_runs(source, started_at);

-- CreateIndex
CREATE INDEX pipeline_runs_status_idx ON pipeline_runs(status);
