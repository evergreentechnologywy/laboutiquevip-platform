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
    <div className="min-h-screen bg-stone-50 py-20 px-4 sm:px-6 lg:px-8">
      <SEO
        title="Contact Support | La Boutique VIP International"
        description="Get in touch with La Boutique VIP support for questions about listings, verification, or account issues."
      />
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-semibold tracking-tight text-stone-900">Contact Support</h1>
          <p className="mt-4 text-stone-600">Have questions? We&apos;re here to help.</p>
        </div>

        {submitted ? (
          <div className="rounded-[28px] border border-stone-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-stone-50">
              <MessageSquare className="h-6 w-6" />
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-stone-900">Message sent</h2>
            <p className="mt-3 text-stone-600">Thank you for reaching out. Our support team will respond to your enquiry via email shortly.</p>
            <Button variant="outline" onClick={() => setSubmitted(false)} className="mt-8 rounded-full border-stone-300">
              Send another message
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6 rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="name">Your Name</Label>
              <Input id="name" placeholder="Name" required className="rounded-xl border-stone-200" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" placeholder="email@example.com" required className="rounded-xl border-stone-200" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" placeholder="How can we help you?" rows={5} required className="rounded-xl border-stone-200" />
            </div>
            <Button type="submit" className="w-full rounded-full bg-stone-900 text-stone-50 hover:bg-stone-800 h-12">
              Send Message
            </Button>
            
            <div className="pt-6 border-t border-stone-100 flex items-center justify-center gap-2 text-sm text-stone-500">
              <Mail className="h-4 w-4" />
              <span>Or email us at: support@laboutiquevip.net</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
