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
    <div className="min-h-screen bg-stone-50 py-20 px-4 sm:px-6 lg:px-8">
      <SEO
        title="Frequently Asked Questions | La Boutique VIP International"
        description="Find answers about verification, listings, reviews, privacy, and how La Boutique VIP works."
      />
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900 mb-12 text-center">Frequently Asked Questions</h1>
        
        <div className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`} className="border-stone-100 last:border-0">
                <AccordionTrigger className="text-left text-lg font-medium text-stone-900 hover:text-stone-700 hover:no-underline py-6">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-base text-stone-600 leading-7 pb-6">
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
