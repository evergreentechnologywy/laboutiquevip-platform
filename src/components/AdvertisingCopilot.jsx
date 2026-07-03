// @ts-nocheck
import React from "react";
import { Bot, CalendarCheck, ExternalLink, Loader2, MapPin, Send, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const starterPrompts = {
  guest: [
    "Help me understand the best package before I register.",
    "What should I prepare before creating an advertiser profile?",
  ],
  signup: [
    "Help me finish this profile so it is ready for review.",
    "Which package should I choose for a new city launch?",
  ],
  dashboard: [
    "What should I improve in my ad this week?",
    "Help me plan a tour and compare city competition.",
  ],
};

function parseCities(value) {
  return value
    .split(",")
    .map((city) => city.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export default function AdvertisingCopilot({
  surface = "guest",
  compact = false,
  className = "",
  defaultPrompt = "",
}) {
  const [message, setMessage] = React.useState(defaultPrompt);
  const [cities, setCities] = React.useState("");
  const [tourCity, setTourCity] = React.useState("");
  const [tourStart, setTourStart] = React.useState("");
  const [tourEnd, setTourEnd] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [mode, setMode] = React.useState(surface === "dashboard" ? "provider" : "guest");
  const [limited, setLimited] = React.useState(surface === "guest");
  const [competition, setCompetition] = React.useState([]);
  const [suggestedActions, setSuggestedActions] = React.useState([]);
  const [appliedActions, setAppliedActions] = React.useState({});
  const [applyingAction, setApplyingAction] = React.useState("");
  const [error, setError] = React.useState("");
  const [success, setSuccess] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const prompts = starterPrompts[surface] || starterPrompts.guest;

  const askCopilot = async (prompt = message) => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError("Ask the copilot what you want to improve, compare, or plan.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const response = await base44.ai.assistant({
        message: trimmed,
        surface,
        cities: parseCities(cities),
        tourDraft: tourCity && tourStart && tourEnd ? {
          city: tourCity.trim(),
          startsAt: new Date(`${tourStart}T00:00:00Z`).toISOString(),
          endsAt: new Date(`${tourEnd}T23:59:59Z`).toISOString(),
        } : undefined,
      });
      setAnswer(response.answer || "");
      setMode(response.mode || "guest");
      setLimited(Boolean(response.limited));
      setCompetition(response.cityCompetition || []);
      setSuggestedActions(response.suggestedActions || []);
      setAppliedActions({});
    } catch (err) {
      setError(err?.data?.message || err?.data?.error || err?.message || "The advertising copilot is unavailable right now.");
    } finally {
      setLoading(false);
    }
  };

  const applyTourDraft = async (action, index) => {
    if (!action?.payload) return;
    const key = `${action.type}-${index}`;
    setApplyingAction(key);
    setError("");
    setSuccess("");
    try {
      const response = await base44.ai.applyTourDraft({
        city: action.payload.city,
        startsAt: action.payload.startsAt,
        endsAt: action.payload.endsAt,
        notes: "Created from the AI advertising copilot after advertiser confirmation.",
      });
      setAppliedActions((current) => ({ ...current, [key]: true }));
      setSuccess(`Tour saved for ${response?.tour?.city || action.payload.city}.`);
    } catch (err) {
      setError(err?.data?.message || err?.data?.error || err?.message || "The tour draft could not be applied.");
    } finally {
      setApplyingAction("");
    }
  };

  return (
    <Card className={`${compact ? "border-stone-200 bg-white text-stone-900" : "border-zinc-800 bg-zinc-900 text-zinc-100"} ${className}`}>
      <CardHeader className={compact ? "p-4" : undefined}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className={`flex items-center gap-2 ${compact ? "text-base text-stone-900" : "text-zinc-100"}`}>
              <Bot className="h-4 w-4" />
              AI advertising copilot
            </CardTitle>
            <CardDescription className={compact ? "text-stone-500" : "text-zinc-400"}>
              Plan ads, tours, photos, packages, and city strategy.
            </CardDescription>
          </div>
          <Badge className={`${limited ? "bg-stone-100 text-stone-600" : "bg-emerald-500/20 text-emerald-300"} border-0`}>
            {limited ? "Limited" : mode}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={`${compact ? "p-4 pt-0" : ""} space-y-4`}>
        <div className="flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              size="sm"
              variant="outline"
              className={compact ? "border-stone-300 text-stone-700" : "border-zinc-700 text-zinc-300"}
              onClick={() => {
                setMessage(prompt);
                askCopilot(prompt);
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {prompt}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <label className={`text-xs font-medium ${compact ? "text-stone-500" : "text-zinc-400"}`}>Cities to compare</label>
          <div className="relative">
            <MapPin className={`absolute left-3 top-3 h-4 w-4 ${compact ? "text-stone-400" : "text-zinc-500"}`} />
            <input
              value={cities}
              onChange={(event) => setCities(event.target.value)}
              placeholder="Miami, Dallas, Madrid"
              className={`h-10 w-full rounded-md border pl-9 pr-3 text-sm outline-none ${compact ? "border-stone-200 bg-white text-stone-900" : "border-zinc-700 bg-zinc-950 text-zinc-100"}`}
            />
          </div>
        </div>

        {!limited && (
          <div className={`rounded-lg border p-3 ${compact ? "border-stone-200 bg-stone-50" : "border-zinc-800 bg-zinc-950"}`}>
            <p className={`mb-3 text-xs font-medium ${compact ? "text-stone-500" : "text-zinc-400"}`}>Draft tour dates</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                value={tourCity}
                onChange={(event) => setTourCity(event.target.value)}
                placeholder="City"
                className={`h-10 rounded-md border px-3 text-sm outline-none ${compact ? "border-stone-200 bg-white text-stone-900" : "border-zinc-700 bg-zinc-900 text-zinc-100"}`}
              />
              <input
                type="date"
                value={tourStart}
                onChange={(event) => setTourStart(event.target.value)}
                className={`h-10 rounded-md border px-3 text-sm outline-none ${compact ? "border-stone-200 bg-white text-stone-900" : "border-zinc-700 bg-zinc-900 text-zinc-100"}`}
              />
              <input
                type="date"
                value={tourEnd}
                onChange={(event) => setTourEnd(event.target.value)}
                className={`h-10 rounded-md border px-3 text-sm outline-none ${compact ? "border-stone-200 bg-white text-stone-900" : "border-zinc-700 bg-zinc-900 text-zinc-100"}`}
              />
            </div>
          </div>
        )}

        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              askCopilot();
            }
          }}
          placeholder="Ask about your ad, photos, city competition, package timing, or tour dates..."
          rows={compact ? 3 : 4}
          className={compact ? "border-stone-200 bg-white text-stone-900" : "border-zinc-700 bg-zinc-950 text-zinc-100"}
        />

        <Button
          type="button"
          onClick={() => askCopilot()}
          disabled={loading}
          className={compact ? "bg-stone-900 text-stone-50 hover:bg-stone-800" : "bg-rose-500 text-white hover:bg-rose-600"}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Ask copilot
        </Button>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className={compact ? "text-sm text-emerald-700" : "text-sm text-emerald-300"}>{success}</p>}

        {competition.length > 0 && (
          <div className={`rounded-lg border p-3 text-sm ${compact ? "border-stone-200 bg-stone-50 text-stone-700" : "border-zinc-800 bg-zinc-950 text-zinc-300"}`}>
            <p className={`mb-2 font-medium ${compact ? "text-stone-900" : "text-zinc-100"}`}>City competition</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {competition.map((item) => (
                <div key={item.city} className="flex items-center justify-between gap-3">
                  <span>{item.city}</span>
                  <Badge className="border-0 bg-blue-500/15 text-blue-300">{item.activeAdvertisers} active</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {suggestedActions.length > 0 && (
          <div className={`rounded-lg border p-3 text-sm ${compact ? "border-stone-200 bg-white text-stone-700" : "border-zinc-800 bg-zinc-950 text-zinc-300"}`}>
            <p className={`mb-3 font-medium ${compact ? "text-stone-900" : "text-zinc-100"}`}>Suggested actions</p>
            <div className="space-y-2">
              {suggestedActions.map((action, index) => (
                <div key={`${action.type}-${index}`} className={`rounded-md border p-3 ${compact ? "border-stone-200 bg-stone-50" : "border-zinc-800 bg-zinc-900"}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{action.label}</span>
                    <Badge className={`${action.requiresConfirmation ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/15 text-blue-300"} border-0`}>
                      {action.requiresConfirmation ? "Review before applying" : "Info"}
                    </Badge>
                  </div>
                  {action.type === "draft_tour" && action.payload && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs opacity-80">
                        {action.payload.city}: {String(action.payload.startsAt).slice(0, 10)} to {String(action.payload.endsAt).slice(0, 10)}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        disabled={Boolean(appliedActions[`${action.type}-${index}`]) || applyingAction === `${action.type}-${index}`}
                        onClick={() => applyTourDraft(action, index)}
                        className={compact ? "bg-stone-900 text-stone-50 hover:bg-stone-800" : "bg-emerald-500 text-white hover:bg-emerald-600"}
                      >
                        {applyingAction === `${action.type}-${index}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CalendarCheck className="h-3.5 w-3.5" />
                        )}
                        {appliedActions[`${action.type}-${index}`] ? "Saved" : "Apply tour"}
                      </Button>
                    </div>
                  )}
                  {action.type === "review_city_events" && action.payload?.cities && (
                    <div className="mt-2 space-y-2 text-xs opacity-80">
                      {action.payload.cities.map((item) => (
                        <div key={item.city}>
                          <span className="font-medium">{item.city}: </span>
                          {item.status === "configured" && item.events?.length
                            ? `${item.events.length} major event${item.events.length === 1 ? "" : "s"} found`
                            : item.note || "No major events returned"}
                        </div>
                      ))}
                    </div>
                  )}
                  {action.type === "promote_city_events" && action.payload?.events && (
                    <div className="mt-3 grid gap-2">
                      {action.payload.events.map((event) => (
                        <a
                          key={`${event.city}-${event.name}-${event.startsAt}`}
                          href={event.ticketUrl || event.url}
                          target="_blank"
                          rel="noreferrer sponsored"
                          className={`flex items-center justify-between gap-3 rounded-md border p-2 transition ${compact ? "border-stone-200 bg-white hover:bg-stone-100" : "border-zinc-800 bg-zinc-950 hover:bg-zinc-800"}`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium">{event.name}</span>
                            <span className="block truncate text-[11px] opacity-70">
                              {event.city}{event.venue ? ` · ${event.venue}` : ""}{event.startsAt ? ` · ${String(event.startsAt).slice(0, 10)}` : ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {event.affiliateTracked && <Badge className="border-0 bg-emerald-500/15 text-emerald-300">Affiliate</Badge>}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {answer && (
          <div className={`whitespace-pre-wrap rounded-lg border p-4 text-sm leading-6 ${compact ? "border-stone-200 bg-stone-50 text-stone-700" : "border-zinc-800 bg-zinc-950 text-zinc-300"}`}>
            {answer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
