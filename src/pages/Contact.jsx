import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import { SEO } from "@/components/SEO";
import { base44 } from "@/api/base44Client";

export default function Contact() {
  const [submitted, setSubmitted] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [form, setForm] = React.useState({ name: "", email: "", message: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await base44.entities.Message.create({
        sender_name: form.name,
        sender_email: form.email,
        content: form.message,
        type: "contact",
      });
      setSubmitted(true);
    } catch (err) {
      setError("Failed to send. Please try again or email support@laboutiquevip.net.");
    } finally {
      setSending(false);
    }
  };

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white py-20 px-4 sm:px-6 lg:px-8">
      <SEO title="Contact Support | La Boutique VIP International" description="Get in touch with La Boutique VIP support for questions about listings, verification, or account issues." />
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-serif font-bold tracking-tight text-zinc-100">Contact Support</h1>
          <p className="mt-4 text-zinc-400 font-light">Have questions? Our team is here to assist.</p>
        </div>

        {submitted ? (
          <div className="rounded-[32px] border border-zinc-900 bg-zinc-900/20 p-12 text-center shadow-2xl backdrop-blur-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-md">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="mt-6 text-2xl font-serif font-bold text-zinc-100">Message sent</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400 font-light">Thank you for reaching out. Our support team will respond to your enquiry via email shortly.</p>
            <Button variant="outline" onClick={() => { setSubmitted(false); setForm({ name: "", email: "", message: "" }); }} className="mt-8 rounded-full border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white px-8">
              Send another message
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 rounded-[32px] border border-zinc-900 bg-zinc-900/20 p-8 shadow-2xl backdrop-blur-md">
            <div className="space-y-2">
              <Label htmlFor="contact-name" className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Your Name</Label>
              <Input id="contact-name" placeholder="Name" required value={form.name} onChange={update("name")} className="bg-zinc-950/70 border-zinc-800 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 focus:ring-amber-500/20 text-sm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email" className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Email Address</Label>
              <Input id="contact-email" type="email" placeholder="email@example.com" required value={form.email} onChange={update("email")} className="bg-zinc-950/70 border-zinc-800 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 focus:ring-amber-500/20 text-sm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-message" className="text-xs uppercase tracking-wider font-semibold text-zinc-400">Message</Label>
              <Textarea id="contact-message" placeholder="How can we help you?" rows={5} required value={form.message} onChange={update("message")} className="bg-zinc-950/70 border-zinc-800 rounded-2xl text-zinc-100 placeholder:text-zinc-600 focus:border-amber-500 focus:ring-amber-500/20 text-sm leading-6" />
            </div>
            {error && <p className="text-sm text-red-400 bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3">{error}</p>}
            <Button type="submit" disabled={sending} className="w-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 h-12 border-0 shadow-lg glow-rose disabled:opacity-70">
              {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</> : "Send Message"}
            </Button>
            <div className="pt-6 border-t border-zinc-900 flex items-center justify-center gap-2 text-xs text-zinc-500 tracking-wide font-light">
              <Mail className="h-4 w-4 text-rose-400" />
              <span>Or email us at: support@laboutiquevip.net</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}