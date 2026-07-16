import type { AppRoute } from '../hooks/useRoute';
import { getBrokerGuideBySlug } from './brokerGuides';
import { LANDING_FAQ } from './faq';
import { GUIDE_ARTICLES, getGuideBySlug } from './guides';
import { SITE_ORIGIN } from './pageMeta';

const ORGANIZATION = {
  '@type': 'Organization',
  '@id': `${SITE_ORIGIN}/#organization`,
  name: 'Trend Chasers',
  url: SITE_ORIGIN,
  logo: `${SITE_ORIGIN}/logo-mark.svg`,
  description:
    'Free trading journal with a visual P&L calendar, performance analytics, and brokerage imports without broker login.',
};

const WEBSITE = {
  '@type': 'WebSite',
  '@id': `${SITE_ORIGIN}/#website`,
  name: 'Trend Chasers',
  alternateName: ['Trend Chasers Trading Journal', 'Trend Chasers Journal'],
  url: SITE_ORIGIN,
  description:
    'Free trading journal to track and improve your performance. Visual P&L calendar and import from your brokerage — no broker login.',
  publisher: { '@id': `${SITE_ORIGIN}/#organization` },
};

const SOFTWARE_APP = {
  '@type': 'SoftwareApplication',
  '@id': `${SITE_ORIGIN}/#software`,
  name: 'Trend Chasers',
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Web',
  url: `${SITE_ORIGIN}/app`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  description:
    'Free trading journal with P&L calendar, AI screenshot import, CSV uploads, and performance analytics.',
};

const NAV_LINKS = [
  { name: 'Open Journal', url: `${SITE_ORIGIN}/app` },
  { name: 'Supported Brokers', url: `${SITE_ORIGIN}/brokers` },
  { name: 'Guides', url: `${SITE_ORIGIN}/guides` },
  { name: 'Request Broker', url: `${SITE_ORIGIN}/request-broker` },
  { name: 'Privacy Policy', url: `${SITE_ORIGIN}/privacy` },
  { name: 'Terms of Service', url: `${SITE_ORIGIN}/terms` },
];

function navigationElements() {
  return NAV_LINKS.map((link) => ({
    '@type': 'SiteNavigationElement',
    name: link.name,
    url: link.url,
  }));
}

function faqPage() {
  return {
    '@type': 'FAQPage',
    '@id': `${SITE_ORIGIN}/#faq`,
    mainEntity: LANDING_FAQ.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

function breadcrumb(items: { name: string; path: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_ORIGIN}${item.path}`,
    })),
  };
}

function guidesItemList() {
  return {
    '@type': 'ItemList',
    '@id': `${SITE_ORIGIN}/guides#list`,
    name: 'Trend Chasers trading journal guides',
    itemListElement: GUIDE_ARTICLES.map((guide, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: guide.title,
      url: `${SITE_ORIGIN}${guide.path}`,
    })),
  };
}

function articleSchema(guideSlug: string) {
  const guide = getGuideBySlug(guideSlug);
  if (!guide) return null;

  return {
    '@type': 'Article',
    '@id': `${SITE_ORIGIN}${guide.path}#article`,
    headline: guide.title,
    description: guide.description,
    author: { '@id': `${SITE_ORIGIN}/#organization` },
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    mainEntityOfPage: `${SITE_ORIGIN}${guide.path}`,
    url: `${SITE_ORIGIN}${guide.path}`,
    image: `${SITE_ORIGIN}/og-image.png`,
    articleSection: 'Trading journal guides',
  };
}

function brokerGuideSchemas(brokerSlug: string): Record<string, unknown>[] {
  const guide = getBrokerGuideBySlug(brokerSlug);
  if (!guide) return [];

  return [
    {
      '@type': 'Article',
      '@id': `${SITE_ORIGIN}${guide.path}#article`,
      headline: guide.title,
      description: guide.description,
      author: { '@id': `${SITE_ORIGIN}/#organization` },
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
      mainEntityOfPage: `${SITE_ORIGIN}${guide.path}`,
      url: `${SITE_ORIGIN}${guide.path}`,
      image: `${SITE_ORIGIN}/og-image.png`,
      articleSection: 'Broker import guides',
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE_ORIGIN}${guide.path}#faq`,
      mainEntity: guide.faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
    breadcrumb([
      { name: 'Home', path: '/' },
      { name: 'Supported Brokers', path: '/brokers' },
      { name: `${guide.brokerName} Trading Journal`, path: guide.path },
    ]),
  ];
}

export function buildStructuredData(
  route: AppRoute,
  guideSlug?: string,
  brokerSlug?: string,
): Record<string, unknown>[] {
  const graph: Record<string, unknown>[] = [
    ORGANIZATION,
    WEBSITE,
    SOFTWARE_APP,
    ...navigationElements(),
  ];

  if (route === 'landing') {
    graph.push(faqPage());
    graph.push(
      breadcrumb([{ name: 'Home', path: '/' }]),
    );
  }

  if (route === 'guides') {
    graph.push(guidesItemList());
    graph.push(
      breadcrumb([
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' },
      ]),
    );
  }

  if (route === 'guide' && guideSlug) {
    const article = articleSchema(guideSlug);
    if (article) graph.push(article);
    graph.push(
      breadcrumb([
        { name: 'Home', path: '/' },
        { name: 'Guides', path: '/guides' },
        {
          name: getGuideBySlug(guideSlug)?.title ?? 'Guide',
          path: `/guides/${guideSlug}`,
        },
      ]),
    );
  }

  if (route === 'brokers') {
    graph.push(
      breadcrumb([
        { name: 'Home', path: '/' },
        { name: 'Supported Brokers', path: '/brokers' },
      ]),
    );
  }

  if (route === 'broker-guide' && brokerSlug) {
    graph.push(...brokerGuideSchemas(brokerSlug));
  }

  return graph;
}
