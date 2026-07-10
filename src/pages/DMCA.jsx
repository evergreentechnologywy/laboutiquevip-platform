import React from "react";

export default function DMCA() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-rose-500/35 selection:text-white">
      <section className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="text-4xl font-serif font-bold text-white mb-8">DMCA Takedown Notice</h1>
        <p className="text-zinc-400 leading-relaxed mb-8">
          La Boutique VIP International respects the intellectual property rights of others and expects its users to do the same. 
          In accordance with the Digital Millennium Copyright Act (DMCA), we will respond expeditiously to claims of copyright infringement 
          committed using our service that are reported to our Designated Copyright Agent.
        </p>
        <h2 className="text-xl font-semibold text-white mb-4">Filing a DMCA Notice</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          To file a DMCA takedown notice, send a written communication to{" "}
          <a href="mailto:dmca@laboutiquevip.net" className="text-rose-400 hover:text-rose-300 underline">dmca@laboutiquevip.net</a>{" "}
          containing the following:
        </p>
        <ul className="list-disc pl-6 space-y-3 text-zinc-400 mb-8">
          <li>Identification of the copyrighted work claimed to be infringed.</li>
          <li>Identification of the material that is claimed to be infringing, with sufficient detail to locate it on our site (URL).</li>
          <li>Your contact information: name, address, phone, and email.</li>
          <li>A statement that you have a good faith belief the use is not authorized by the copyright owner, its agent, or law.</li>
          <li>A statement under penalty of perjury that the information in the notice is accurate and you are authorized to act on behalf of the copyright owner.</li>
          <li>Your physical or electronic signature.</li>
        </ul>
        <h2 className="text-xl font-semibold text-white mb-4">Counter-Notification</h2>
        <p className="text-zinc-400 leading-relaxed mb-4">
          If content you posted was removed due to a DMCA notice, you may file a counter-notification. 
          Send it to the same email address above with your contact information, identification of the removed material, 
          and a statement under penalty of perjury that you have a good faith belief the material was removed in error.
        </p>
        <p className="text-xs text-zinc-600 mt-12 pt-8 border-t border-zinc-900">
          This page is provided for informational purposes only and does not constitute legal advice.
        </p>
      </section>
    </div>
  );
}