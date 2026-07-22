import React from "react";

export function SEO({ title, description, ogTitle, ogDescription, ogImage, ogUrl, noindex = false, jsonLd }) {
  React.useEffect(() => {
    if (title) document.title = title;

    const updateMeta = (name, content, attr = 'name') => {
      if (content === undefined || content === null) return;
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // Canonical = origin + pathname (query/hash stripped) so ?id= and tracking
    // params never fragment indexation.
    const canonicalUrl = window.location.origin + window.location.pathname;

    updateMeta('description', description);
    updateMeta('og:title', ogTitle || title, 'property');
    updateMeta('og:description', ogDescription || description, 'property');
    updateMeta('og:image', ogImage, 'property');
    updateMeta('og:url', ogUrl || canonicalUrl, 'property');
    updateMeta('og:type', 'website', 'property');

    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', canonicalUrl);

    if (noindex) {
      updateMeta('robots', 'noindex, nofollow');
    } else {
      updateMeta('robots', 'index, follow');
    }

    let jsonLdEl = document.getElementById('lbv-json-ld');
    if (jsonLd) {
      if (!jsonLdEl) {
        jsonLdEl = document.createElement('script');
        jsonLdEl.id = 'lbv-json-ld';
        jsonLdEl.type = 'application/ld+json';
        document.head.appendChild(jsonLdEl);
      }
      jsonLdEl.textContent = JSON.stringify(jsonLd);
    } else if (jsonLdEl) {
      jsonLdEl.remove();
    }

    return () => {
      const el = document.getElementById('lbv-json-ld');
      if (el) el.remove();
    };
  }, [title, description, ogTitle, ogDescription, ogImage, ogUrl, noindex, jsonLd]);

  return null;
}
