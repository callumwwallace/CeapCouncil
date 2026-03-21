import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = 'https://ceapcouncil.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/playground',
          '/competitions',
          '/community',
          '/blog',
          '/docs',
          '/feed',
        ],
        disallow: [
          '/dashboard',
          '/profile/edit',
          '/settings',
          '/api/',
          '/check-email',
          '/verify-email',
          '/reset-password',
          '/forgot-password',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
