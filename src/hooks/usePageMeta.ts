import { useEffect } from 'react';

export function usePageMeta(
  title: string,
  description: string,
  path: string,
  options?: {
    robots?: string;
    structuredData?: Record<string, unknown>;
  }
) {
  const robots = options?.robots ?? 'index,follow';
  const sdString = options?.structuredData ? JSON.stringify(options.structuredData) : '';

  useEffect(() => {
    document.title = title;

    const setMeta = (attr: 'name' | 'property', key: string, value: string) => {
      let tag = document.querySelector(`meta[${attr}="${key}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attr, key);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', value);
    };

    const url = `${window.location.origin}${path}`;
    setMeta('name', 'description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'robots', robots);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', url);

    if (sdString) {
      let ldScript = document.querySelector('script[type="application/ld+json"]');
      if (!ldScript) {
        ldScript = document.createElement('script');
        ldScript.setAttribute('type', 'application/ld+json');
        document.head.appendChild(ldScript);
      }
      ldScript.textContent = sdString;
    }
  }, [title, description, path, robots, sdString]);
}
