// @ts-nocheck
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RequireRole } from "@/components/RequireRole";
import { SEO } from "@/components/SEO";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, CalendarClock, Crown, Play, RefreshCw, Server, Terminal, Wrench } from "lucide-react";
import {
  fetchDevImportLogs,
  fetchDevImportStatus,
  setDevMaintenance,
  triggerDevImport,
  fetchSystemStatus,
  fetchPipelineRuns,
} from "@/api/devOps";

const MANUAL_SOURCES = ["evergreen", "eros", "tryst", "orchestrator"];
const LOG_SOURCES = ["scan", "merge", "evergreen", "eros", "tryst", "orchestrator"];

function StatusBadge({ active, label }) {
  return (
    <Badge className={active ? "bg-amber-500/20 text-amber-400 border-0" : "bg-zinc-700 text-zinc-300 border-0"}>
      {label}
    </Badge>
  );
}

function PhaseList({ phases, currentPhase }) {
  if (!phases?.length) return null;
  return (
    <ul className="space-y-1 text-xs">
      {phases.map((phase) => {
        const active = currentPhase === phase;
        const done = currentPhase && phases.indexOf(phase) < phases.indexOf(currentPhase);
        return (
          <li key={phase} className={active ? "text-amber-300" : done ? "text-emerald-400/80" : "text-zinc-500"}>
            {active ? "▸ " : done ? "✓ " : "· "}
            {phase}
          </li>
        );
      })}
    </ul>
  );
}

export default function DevDashboard() {
  const [logSource, setLogSource] = React.useState("scan");
  const [maintenanceMode, setMaintenanceMode] = React.useState("off");
  const queryClient = useQueryClient();

  const { data: status, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dev-import-status"],
    queryFn: fetchDevImportStatus,
    refetchInterval: 15_000,
  });

  const { data: sysStatus, isError: sysErr } = useQuery({
    queryKey: ["dev-system-status"],
    queryFn: fetchSystemStatus,
    retry: false,
    refetchInterval: 30000,
  });

  const { data: pipelineRuns = [], isError: pipeErr } = useQuery({
    queryKey: ["dev-pipeline-runs"],
    queryFn: () => fetchPipelineRuns({ limit: 10 }),
    retry: false,
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["dev-import-logs", logSource],
    queryFn: () => fetchDevImportLogs(logSource),
    refetchInterval: 30_000,
  });

  React.useEffect(() => {
    if (status?.maintenance?.mode) {
      setMaintenanceMode(status.maintenance.mode);
    }
  }, [status?.maintenance?.mode]);

  const triggerMutation = useMutation({
    mutationFn: triggerDevImport,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dev-import-status"] }),
  });

  const maintenanceMutation = useMutation({
    mutationFn: setDevMaintenance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dev-import-status"] }),
  });

  const pipeline = status?.catalogPipeline;
  const evergreen = status?.evergreenModels;
  const evergreenImport = status?.imports?.evergreen ?? {};
  const notify = pipeline?.notify?.state;
  const lastStats = notify?.lastStats;

  return (
    <RequireRole roles={["admin", "dev"]} loginNext="/devdashboard">
      <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
        <SEO title="Dev Dashboard | La Boutique VIP" noindex />
        <div className="max-w-6xl mx-auto space-y-6">

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader><CardTitle className="text-zinc-100 flex items-center gap-2"><Server className="w-5 h-5" /> System Health</CardTitle></CardHeader>
            <CardContent>
              {sysErr ? (
                <p className="text-zinc-400 text-sm">System status endpoint unavailable.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><p className="text-zinc-500">Status</p><p className="text-zinc-100 font-medium">{sysStatus?.status || sysStatus?.state || "ok"}</p></div>
                  <div><p className="text-zinc-500">Uptime</p><p className="text-zinc-100 font-medium">{sysStatus?.uptime ?? sysStatus?.uptimeSeconds ?? "—"}</p></div>
                  <div><p className="text-zinc-500">Version</p><p className="text-zinc-100 font-medium">{sysStatus?.version || sysStatus?.build || "—"}</p></div>
                  <div><p className="text-zinc-500">Pipeline runs</p><p className="text-zinc-100 font-medium">{pipeErr ? "pending" : (pipelineRuns.runs || pipelineRuns).length}</p></div>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-zinc-100 mb-2">Dev Dashboard</h1>
              <p className="text-zinc-400">
                US verified catalog pipeline (8 PM scan → midnight merge), manual import triggers, and sanitized logs.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-zinc-700"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-sky-400" />
                Daily catalog pipeline (production)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-zinc-400">
              {isLoading ? (
                <Skeleton className="h-32" />
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-zinc-800 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-200 font-medium">8 PM scan (staging)</span>
                        <StatusBadge
                          active={pipeline?.scan?.inProgress}
                          label={pipeline?.scan?.inProgress ? pipeline.scan.phase || "running" : "idle"}
                        />
                      </div>
                      <p>{pipeline?.schedule?.scanCron}</p>
                      {pipeline?.scan?.startedAt && <p>Started: {pipeline.scan.startedAt}</p>}
                      {pipeline?.scan?.lastReportLine && (
                        <p className="text-xs text-zinc-500 break-all">{pipeline.scan.lastReportLine}</p>
                      )}
                    </div>
                    <div className="rounded-lg border border-zinc-800 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-200 font-medium">Midnight merge (production)</span>
                        <StatusBadge
                          active={pipeline?.merge?.inProgress}
                          label={pipeline?.merge?.inProgress ? pipeline.merge.phase || "running" : "idle"}
                        />
                      </div>
                      <p>{pipeline?.schedule?.mergeCron}</p>
                      {pipeline?.merge?.startedAt && <p>Started: {pipeline.merge.startedAt}</p>}
                      {pipeline?.merge?.lastReportLine && (
                        <p className="text-xs text-zinc-500 break-all">{pipeline.merge.lastReportLine}</p>
                      )}
                    </div>
                  </div>

                  {status?.mergePhases?.length > 0 && (
                    <div>
                      <p className="text-zinc-300 mb-2">Merge phases</p>
                      <PhaseList phases={status.mergePhases} currentPhase={pipeline?.merge?.phase} />
                    </div>
                  )}

                  <div className="grid md:grid-cols-3 gap-3 text-xs">
                    <div className="rounded border border-zinc-800 p-3">
                      <p className="text-zinc-300 mb-1">Staging cache</p>
                      <p className="break-all">{pipeline?.staging?.latestCacheDir || "none"}</p>
                      <p className="mt-1">
                        Eros {pipeline?.staging?.erosRecords ?? "—"} · Tryst {pipeline?.staging?.trystRecords ?? "—"}
                      </p>
                    </div>
                    <div className="rounded border border-zinc-800 p-3">
                      <p className="text-zinc-300 mb-1">Caps</p>
                      <p>
                        {pipeline?.caps?.profilesPerCity}/city · {pipeline?.caps?.profilesPerState}/state (Eros)
                      </p>
                      <p>
                        Tryst {pipeline?.caps?.trystMaxProfilesPerCity}/city · top{" "}
                        {pipeline?.caps?.trystMaxCitiesPerState} cities/state
                      </p>
                      <p>
                        Gate: {pipeline?.caps?.strictVerificationGate ? "P411/review required" : "off"} · review limit{" "}
                        {pipeline?.caps?.reviewMatchLimit === 0 ? "∞" : pipeline?.caps?.reviewMatchLimit}
                      </p>
                    </div>
                    <div className="rounded border border-zinc-800 p-3">
                      <p className="text-zinc-300 mb-1">Last Hermes stats</p>
                      {lastStats ? (
                        <ul className="space-y-0.5">
                          {lastStats.merge && (
                            <li>
                              Merge +{lastStats.merge.created ?? 0} / ~{lastStats.merge.updated ?? 0} upd
                            </li>
                          )}
                          {lastStats.stagedR2 && (
                            <li>R2 staged {lastStats.stagedR2.updated ?? 0}</li>
                          )}
                          {lastStats.review && (
                            <li>
                              Review {lastStats.review.matched}/{lastStats.review.scanned}
                            </li>
                          )}
                        </ul>
                      ) : (
                        <p>No notify state on this host.</p>
                      )}
                      {notify?.lastRunAt && <p className="mt-1 text-zinc-500">Last run: {notify.lastRunAt}</p>}
                    </div>
                  </div>

                  {status?.cron && (
                    <div className="text-xs text-zinc-500 space-y-1 border-t border-zinc-800 pt-3">
                      <p>Failsafe: {status.cron.failsafeCron}</p>
                      <p>Manual triggers: {status.cron.orchestratorPoll}</p>
                      <p>{pipeline?.legacyOrchestrator?.note}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <Crown className="w-5 h-5 text-violet-400" />
                Evergreen elite models
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-zinc-400">
              {isLoading ? (
                <Skeleton className="h-32" />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      active={Boolean(evergreenImport.inProgress)}
                      label={evergreenImport.inProgress ? evergreenImport.state || "running" : "idle"}
                    />
                    <Badge className="bg-violet-500/20 text-violet-300 border-0">Auto: midnight merge</Badge>
                  </div>
                  <p>{evergreen?.autoSync?.note}</p>
                  <p className="text-xs text-zinc-500">{evergreen?.autoSync?.schedule}</p>

                  <div className="grid md:grid-cols-3 gap-3 text-xs">
                    <div className="rounded border border-zinc-800 p-3">
                      <p className="text-zinc-300 mb-1">SiteConsole list</p>
                      <p>
                        {evergreen?.sources?.sitesAvailable
                          ? `${evergreen.sources.siteCount} sites`
                          : "sites.json not on this host"}
                      </p>
                      {evergreen?.sources?.siteDomains?.length > 0 && (
                        <p className="mt-1 text-zinc-500 break-all">
                          {evergreen.sources.siteDomains.slice(0, 8).join(", ")}
                          {evergreen.sources.siteDomains.length > 8 ? "…" : ""}
                        </p>
                      )}
                    </div>
                    <div className="rounded border border-zinc-800 p-3">
                      <p className="text-zinc-300 mb-1">Calendar profiles</p>
                      <p>
                        {evergreen?.sources?.modelProfilesAvailable
                          ? `${evergreen.sources.modelProfileCount} models`
                          : "model-profiles.json missing"}
                      </p>
                      {evergreen?.sources?.modelNames?.length > 0 && (
                        <p className="mt-1 text-zinc-500">{evergreen.sources.modelNames.slice(0, 6).join(", ")}…</p>
                      )}
                    </div>
                    <div className="rounded border border-zinc-800 p-3">
                      <p className="text-zinc-300 mb-1">LBV catalog</p>
                      <p>Evergreen active: {evergreen?.catalog?.activeEvergreenProviders ?? "—"}</p>
                      <p>Elite tier: {evergreen?.catalog?.eliteProviders ?? "—"}</p>
                      {evergreen?.lastRun?.finishedAt && (
                        <p className="mt-1 text-zinc-500">Last sync: {String(evergreen.lastRun.finishedAt)}</p>
                      )}
                      {evergreen?.lastRun?.stats && (
                        <p className="text-zinc-500">
                          +{evergreen.lastRun.stats.created ?? 0} created · {evergreen.lastRun.stats.updated ?? 0}{" "}
                          updated · {evergreen.lastRun.stats.skipped ?? 0} skipped
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    disabled={triggerMutation.isPending || evergreenImport.inProgress}
                    onClick={() => triggerMutation.mutate({ source: "evergreen", mode: "full" })}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    Sync Evergreen models now
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-400" />
                Maintenance mode
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-4">
              <div className="w-48">
                <Select value={maintenanceMode} onValueChange={setMaintenanceMode}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="soft">Soft (stale cache OK)</SelectItem>
                    <SelectItem value="hard">Hard (503 catalog)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => maintenanceMutation.mutate(maintenanceMode)}
                disabled={maintenanceMutation.isPending}
              >
                Apply maintenance
              </Button>
              {status?.maintenance?.banner && (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-0">{status.maintenance.banner}</Badge>
              )}
            </CardContent>
          </Card>

          <div>
            <h2 className="text-lg font-semibold text-zinc-200 mb-3">Manual import triggers</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)
              ) : (
                MANUAL_SOURCES.map((source) => {
                  const row = status?.imports?.[source] ?? {};
                  const inProgress = Boolean(row.inProgress);
                  return (
                    <Card key={source} className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-zinc-100 capitalize flex items-center justify-between">
                          {source}
                          <StatusBadge active={inProgress} label={inProgress ? "queued" : row.state || "idle"} />
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm text-zinc-400">
                        {row.lastRunAt && <p>Last run: {String(row.lastRunAt)}</p>}
                        {row.finishedAt && <p>Finished: {String(row.finishedAt)}</p>}
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-zinc-700 flex-1"
                            disabled={triggerMutation.isPending || inProgress}
                            onClick={() => triggerMutation.mutate({ source, mode: "pilot" })}
                          >
                            <Play className="w-3 h-3 mr-1" /> Pilot
                          </Button>
                          <Button
                            size="sm"
                            className="flex-1"
                            disabled={triggerMutation.isPending || inProgress}
                            onClick={() => triggerMutation.mutate({ source, mode: "full" })}
                          >
                            <Server className="w-3 h-3 mr-1" /> Full
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-sky-400" />
                Log tail (sanitized)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={logSource} onValueChange={setLogSource}>
                <TabsList className="bg-zinc-950 border border-zinc-800 mb-4 flex-wrap h-auto">
                  {LOG_SOURCES.map((source) => (
                    <TabsTrigger key={source} value={source} className="capitalize">
                      {source}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {LOG_SOURCES.map((source) => (
                  <TabsContent key={source} value={source}>
                    {logsLoading ? (
                      <Skeleton className="h-48" />
                    ) : (
                      <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-950 border border-zinc-800 p-4 text-xs text-zinc-300 whitespace-pre-wrap">
                        {(logs?.lines?.length ? logs.lines : ["No log lines available on this host."]).join("\n")}
                      </pre>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 text-sm text-zinc-500">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              Production catalog updates run automatically: <strong className="text-zinc-400">8 PM</strong> cache-only
              scan (Eros + Tryst, P411/review gate) then <strong className="text-zinc-400">midnight</strong> merge to
              DB, staged R2, reconcile, review match, dedupe, <strong className="text-zinc-400">Evergreen elite models</strong>,
              and full Eros/Tryst photo refresh. Manual triggers write request files under{" "}
              <code>/var/run/lboutiquevip/</code> for the orchestrator poller.
            </p>
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
