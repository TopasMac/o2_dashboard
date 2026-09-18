import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { usesHausInBrand } from './appBrandingModel';

const HAUSIN_ICON_ROOT = '/branding/hausin';

function setMetaContent(selector, content) {
  const element = document.querySelector(selector);
  if (element) element.setAttribute('content', content);
}

function replaceIcons(isHausIn) {
  document.querySelectorAll('link[rel*="icon"]').forEach((link) => link.remove());

  const icons = isHausIn
    ? [16, 32, 48, 96, 192, 512].map((size) => ({
        rel: 'icon',
        type: 'image/png',
        sizes: `${size}x${size}`,
        href: `${HAUSIN_ICON_ROOT}/icon-${size}x${size}.png`,
      }))
    : [{ rel: 'icon', href: '/favicon.ico' }];

  const appleTouchIcon = {
    rel: 'apple-touch-icon',
    type: 'image/png',
    sizes: '180x180',
    href: isHausIn
      ? `${HAUSIN_ICON_ROOT}/app-icon-180x180-white.png`
      : '/apple-touch-icon.png',
  };

  [...icons, appleTouchIcon].forEach((attributes) => {
    const link = document.createElement('link');
    Object.entries(attributes).forEach(([name, value]) => link.setAttribute(name, value));
    link.setAttribute('data-runtime-brand-icon', 'true');
    document.head.appendChild(link);
  });
}

export default function AppBranding() {
  const location = useLocation();

  useEffect(() => {
    const isHausIn = usesHausInBrand(window.location.hostname, location.pathname);
    const title = isHausIn ? 'HausIn App' : 'Owners2 Dashboard';
    const description = isHausIn
      ? 'HausIn property operations app'
      : 'Owners2 Dashboard - Manage your rentals easily';

    document.title = title;
    setMetaContent('meta[name="description"]', description);
    setMetaContent('meta[name="theme-color"]', isHausIn ? '#1E6F68' : '#000000');
    setMetaContent('meta[property="og:title"]', title);
    setMetaContent('meta[property="og:description"]', description);

    replaceIcons(isHausIn);

    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest) {
      manifest.setAttribute('href', isHausIn ? '/manifest-hausin.json' : '/manifest.json');
    }
  }, [location.pathname]);

  return null;
}
