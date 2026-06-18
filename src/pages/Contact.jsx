import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, MessageSquare } from "lucide-react";
import { SEO } from "@/components/SEO";

export default function Contact() {
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    // Simulate submission
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white py-20 px-4 sm:px-6 lg:px-8">
      <SEO
        title="Contact Support | La Boutique VIP International"
        description="Get in touch with La Boutique VIP support for questions about listings, verification, or account issues."
      />
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-serif font-bold tracking-tight text-zinc-100">Contact Support</h1>
          <p className="mt-4 text-zinc-400 font-light">Have questions? Our team is here to assist.</p>
        </div>

        {submitted ? (
          <div className="rounded-[32px] border border-zinc-900 bg-zinc-900/20 p-12 text-center shadow-2xl backdrop-blur-md">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-950 border border-zinc-900 text-amber-400 shadow-md">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h2 className="mt-6 text-2xl font-serif font-bold text-zinc-100">Message sent</h2>
            <p className="mt-3 text-sm leading-6 text-zinc-450 font-light">Thank you for reaching out. Our support team will respond to your enquiry via email shortly.</p>
            <Button variant="outline" onClick={() => setSubmitted(false)} className="mt-8 rounded-full border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white px-8">
              Send another message
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 rounded-[32px] border border-zinc-900 bg-zinc-900/20 p-8 shadow-2xl backdrop-blur-md">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-xs uppercase tracking-wider font-semibold text-zinc-550">Your Name</Label>
              <Input id="name" placeholder="Name" required className="bg-zinc-950/70 border-zinc-850 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs uppercase tracking-wider font-semibold text-zinc-550">Email Address</Label>
              <Input id="email" type="email" placeholder="email@example.com" required className="bg-zinc-950/70 border-zinc-850 h-12 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message" className="text-xs uppercase tracking-wider font-semibold text-zinc-550">Message</Label>
              <Textarea id="message" placeholder="How can we help you?" rows={5} required className="bg-zinc-950/70 border-zinc-850 rounded-2xl text-zinc-100 placeholder:text-zinc-550 focus:border-amber-500 focus:ring-amber-500/20 text-sm leading-6" />
            </div>
            <Button type="submit" className="w-full rounded-full bg-gradient-to-r from-rose-500 to-amber-500 text-white font-semibold hover:opacity-95 h-12 border-0 shadow-lg glow-rose">
              Send Message
            </Button>
            
            <div className="pt-6 border-t border-zinc-900/80 flex items-center justify-center gap-2 text-xs text-zinc-500 tracking-wide font-light">
              <Mail className="h-4 w-4 text-rose-450" />
              <span>Or email us at: support@laboutiquevip.net</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
