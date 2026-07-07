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
import { AlertCircle, Play, RefreshCw, Server, Terminal, Wrench } from "lucide-react";
import {
  fetchDevImportLogs,
  fetchDevImportStatus,
  setDevMaintenance,
  triggerDevImport,
} from "@/api/devOps";

const SOURCES = ["eros", "tryst", "orchestrator"];

export default function DevDashboard() {
  const [logSource, setLogSource] = React.useState("eros");
  const [maintenanceMode, setMaintenanceMode] = React.useState("off");
  const queryClient = useQueryClient();

  const { data: status, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["dev-import-status"],
    queryFn: fetchDevImportStatus,
    refetchInterval: 15_000,
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

  return (
    <RequireRole roles={["admin", "dev"]} loginNext="/devdashboard">
      <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
        <SEO title="Dev Dashboard | La Boutique VIP" noindex />
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-zinc-100 mb-2">Dev Dashboard</h1>
              <p className="text-zinc-400">
                Import control, maintenance windows, and sanitized logs. Not for external QA unless granted the <code className="text-amber-400">dev</code> role.
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

          <div className="grid md:grid-cols-3 gap-4">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)
            ) : (
              SOURCES.map((source) => {
                const row = status?.imports?.[source] ?? {};
                const inProgress = Boolean(row.inProgress);
                return (
                  <Card key={source} className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-zinc-100 capitalize flex items-center justify-between">
                        {source}
                        <Badge className={inProgress ? "bg-amber-500/20 text-amber-400 border-0" : "bg-zinc-700 text-zinc-300 border-0"}>
                          {inProgress ? "running" : row.state || "idle"}
                        </Badge>
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

          {status?.cron && (
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="pt-6 text-sm text-zinc-400">
                <p>Orchestrator poll: {status.cron.orchestratorPoll}</p>
                <p>Eros reconcile: {status.cron.erosReconcile}</p>
                <p>Tryst import: {status.cron.trysImport}</p>
              </CardContent>
            </Card>
          )}

          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100 flex items-center gap-2">
                <Terminal className="w-5 h-5 text-sky-400" />
                Log tail (sanitized)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs value={logSource} onValueChange={setLogSource}>
                <TabsList className="bg-zinc-950 border border-zinc-800 mb-4">
                  {SOURCES.map((source) => (
                    <TabsTrigger key={source} value={source} className="capitalize">{source}</TabsTrigger>
                  ))}
                </TabsList>
                {SOURCES.map((source) => (
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
              Triggers write request files under <code>/var/run/lboutiquevip/</code>; the orchestrator cron picks them up within one minute.
              Do not trigger full imports during active Eros cron unless intentional.
            </p>
          </div>
        </div>
      </div>
    </RequireRole>
  );
}
