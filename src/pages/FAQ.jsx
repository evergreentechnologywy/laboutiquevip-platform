import React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SEO } from "@/components/SEO";

const faqs = [
  { question: "How does verification work?", answer: "Verification status is awarded after advertisers complete identity checks through our integrated external service providers and pass internal moderation review." },
  { question: "How do I create a listing?", answer: "Register as a provider, complete your profile details, choose an advertising package, and submit your verification documents. Once approved, your listing goes live." },
  { question: "How do reviews work?", answer: "Reviews can be left by users who have interacted with an advertiser. All reviews undergo moderation before publication to meet our community standards." },
  { question: "Is my data private?", answer: "We take privacy seriously. Personal information is used only as described in our Privacy Policy and is protected with industry-standard security measures." },
  { question: "How much does it cost?", answer: "We offer several advertising packages starting from a free tier. Premium placement and additional visibility features are available on paid plans. See our Pricing page for details." },
  { question: "How do I pay?", answer: "We accept cryptocurrency payments only at this time — Bitcoin (BTC), Ethereum (ETH), and USDT (TRC-20). Ad credits are allocated immediately after confirmation and invoicing is handled electronically." },
  { question: "Can I get a refund?", answer: "Package fees are for advertising visibility placement. Refunds are handled on a case-by-case basis. Contact support for questions about your specific situation." },
  { question: "How do I report a profile?", answer: "Use the Contact page with \"Report\" in the subject, or email support@laboutiquevip.net. Include the profile URL and reason for reporting." },
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white py-20 px-4 sm:px-6 lg:px-8">
      <SEO title="Frequently Asked Questions | La Boutique VIP International" description="Find answers about verification, listings, reviews, privacy, pricing, and how La Boutique VIP works." />
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-serif font-bold tracking-tight text-zinc-100 mb-4 text-center">Frequently Asked Questions</h1>
        <p className="text-zinc-500 text-center mb-12">Can't find what you're looking for? <a href="/contact" className="text-amber-400 hover:text-amber-300 underline underline-offset-4">Contact support</a>.</p>
        <div className="rounded-[32px] border border-zinc-900 bg-zinc-900/20 p-8 shadow-2xl backdrop-blur-md">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-zinc-800 last:border-0">
                <AccordionTrigger className="text-left text-lg font-medium text-zinc-200 hover:text-amber-400 hover:no-underline py-6">{faq.question}</AccordionTrigger>
                <AccordionContent className="text-base text-zinc-400 font-light leading-7 pb-6">{faq.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}