import React from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";

export function ProviderInquiryForm({ provider, compact = false }) {
  const [form, setForm] = React.useState({
    sender_name: "",
    sender_email: "",
    subject: "",
    message: "",
  });
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState("");

  if (!provider?.id) return null;

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSending(true);
    setError("");
    try {
      await base44.entities.Message.create({
        provider_id: provider.id,
        sender_name: form.sender_name.trim(),
        sender_email: form.sender_email.trim(),
        subject: form.subject.trim() || `Inquiry for ${provider.display_name}`,
        message: form.message.trim(),
      });
      setSent(true);
      setForm({ sender_name: "", sender_email: "", subject: "", message: "" });
    } catch (err) {
      const status = err?.status;
      if (status === 429) {
        setError("Too many messages. Wait a few minutes and try again.");
      } else {
        setError("Could not send the inquiry. Use the contact links below or try again.");
      }
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div id="advertiser-inquiry" className={`rounded-2xl border border-emerald-500/20 bg-emerald-500/10 ${compact ? "p-4" : "p-5"}`}>
        <p className="text-sm font-semibold text-emerald-200">Inquiry sent</p>
        <p className="mt-1 text-xs leading-5 text-emerald-100/80">
          The advertiser can read this message in the La Boutique VIP inbox.
        </p>
        <button
          type="button"
          className="mt-3 text-xs font-semibold uppercase tracking-wider text-emerald-300 hover:text-white"
          onClick={() => setSent(false)}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form id="advertiser-inquiry" onSubmit={handleSubmit} className="space-y-3">
      <div>
        <h3 className="text-white font-serif text-lg">Message this advertiser</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          The listing owner receives this in the advertiser inbox. Do not send payment details.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inquiry-name" className="text-[11px] uppercase tracking-wider text-zinc-500">
          Your name
        </Label>
        <Input
          id="inquiry-name"
          required
          value={form.sender_name}
          onChange={update("sender_name")}
          className="h-11 rounded-xl bg-black/40 border-white/10 text-zinc-100"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inquiry-email" className="text-[11px] uppercase tracking-wider text-zinc-500">
          Your email
        </Label>
        <Input
          id="inquiry-email"
          type="email"
          required
          value={form.sender_email}
          onChange={update("sender_email")}
          className="h-11 rounded-xl bg-black/40 border-white/10 text-zinc-100"
        />
      </div>
      {!compact && (
        <div className="space-y-1.5">
          <Label htmlFor="inquiry-subject" className="text-[11px] uppercase tracking-wider text-zinc-500">
            Subject
          </Label>
          <Input
            id="inquiry-subject"
            value={form.subject}
            onChange={update("subject")}
            placeholder={`Inquiry for ${provider.display_name}`}
            className="h-11 rounded-xl bg-black/40 border-white/10 text-zinc-100"
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="inquiry-message" className="text-[11px] uppercase tracking-wider text-zinc-500">
          Message
        </Label>
        <Textarea
          id="inquiry-message"
          required
          minLength={3}
          rows={compact ? 4 : 5}
          value={form.message}
          onChange={update("message")}
          className="rounded-xl bg-black/40 border-white/10 text-zinc-100"
        />
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
      <Button
        type="submit"
        disabled={sending}
        className="w-full h-11 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold border-0"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {sending ? "Sending" : "Send inquiry"}
      </Button>
    </form>
  );
}
