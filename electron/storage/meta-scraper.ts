/** Script injected into guest page to extract meta tags and favicon URL. */
export const META_SCRAPE_SCRIPT = `
(function() {
  function meta(name, attr) {
    attr = attr || 'name';
    var el = document.querySelector('meta[' + attr + '="' + name + '"]');
    return el ? el.getAttribute('content') || '' : '';
  }
  function og(prop) {
    return meta('og:' + prop, 'property');
  }
  var favicon = '';
  var links = document.querySelectorAll('link[rel*="icon"]');
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href');
    if (href) {
      try { favicon = new URL(href, location.href).href; break; } catch(e) {}
    }
  }
  if (!favicon) {
    try { favicon = new URL('/favicon.ico', location.origin).href; } catch(e) {}
  }
  var keywords = meta('keywords').split(',').map(function(k) { return k.trim(); }).filter(Boolean);
  var articleTags = meta('article:tag', 'property').split(',').map(function(k) { return k.trim(); }).filter(Boolean);
  return {
    title: document.title || '',
    url: location.href,
    description: meta('description') || og('description') || '',
    ogTitle: og('title') || '',
    ogImage: og('image') || '',
    ogDescription: og('description') || '',
    keywords: keywords,
    articleTags: articleTags,
    faviconUrl: favicon
  };
})();
`;

export interface PageMeta {
  title: string;
  url: string;
  description: string;
  ogTitle: string;
  ogImage: string;
  ogDescription: string;
  keywords: string[];
  articleTags: string[];
  faviconUrl: string;
}

export function emptyMeta(url: string, title = ""): PageMeta {
  return {
    title,
    url,
    description: "",
    ogTitle: "",
    ogImage: "",
    ogDescription: "",
    keywords: [],
    articleTags: [],
    faviconUrl: "",
  };
}
