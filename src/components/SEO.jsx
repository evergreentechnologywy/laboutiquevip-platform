import React from "react";

export function SEO({ title, description, ogTitle, ogDescription, ogImage, ogUrl, noindex = false }) {
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

    updateMeta('description', description);
    updateMeta('og:title', ogTitle || title, 'property');
    updateMeta('og:description', ogDescription || description, 'property');
    updateMeta('og:image', ogImage, 'property');
    updateMeta('og:url', ogUrl || window.location.href, 'property');
    
    if (noindex) {
      updateMeta('robots', 'noindex, nofollow');
    } else {
      // Optionally remove it or set to index if it was previously set
      const el = document.querySelector('meta[name="robots"]');
      if (el && el.getAttribute('content') === 'noindex, nofollow') {
        el.setAttribute('content', 'index, follow');
      }
    }
  }, [title, description, ogTitle, ogDescription, ogImage, ogUrl, noindex]);

  return null;
}
