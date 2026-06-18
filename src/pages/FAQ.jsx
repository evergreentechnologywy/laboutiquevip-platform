import React from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SEO } from "@/components/SEO";

const faqs = [
  {
    question: "How does verification work?",
    answer: "Verification status is awarded after advertisers complete identity checks through our integrated external service providers and pass internal moderation review."
  },
  {
    question: "How do I create a listing?",
    answer: "To create a listing, register as a provider, complete your profile details, choose an advertising package, and submit your verification documents. Once approved, your listing goes live."
  },
  {
    question: "How do reviews work?",
    answer: "Reviews can be left by users who have interacted with an advertiser. All reviews undergo moderation before publication to ensure they meet our community standards."
  },
  {
    question: "Is my data private?",
    answer: "We take privacy seriously. Your personal information is used only as described in our Privacy Policy and is protected with industry-standard security measures. Masked contact info is used on public profiles to enhance provider privacy."
  }
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white py-20 px-4 sm:px-6 lg:px-8">
      <SEO
        title="Frequently Asked Questions | La Boutique VIP International"
        description="Find answers about verification, listings, reviews, privacy, and how La Boutique VIP works."
      />
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-serif font-bold tracking-tight text-zinc-100 mb-12 text-center">Frequently Asked Questions</h1>
        
        <div className="rounded-[32px] border border-zinc-900 bg-zinc-900/20 p-8 shadow-2xl backdrop-blur-md">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-zinc-850 last:border-0">
                <AccordionTrigger className="text-left text-lg font-medium text-zinc-200 hover:text-amber-450 hover:no-underline py-6">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-base text-zinc-400 font-light leading-7 pb-6">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
  );
}
