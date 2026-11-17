import {
  SITE_DESCRIPTION,
  SITE_GITHUB,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/site";

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#software`;

/**
 * The organisation behind the pilot. Deliberately claims only what the
 * repository supports: a Kalahandi, Odisha pilot — not a registered company
 * with a street address or a user count.
 */
export const organizationNode = {
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: SITE_NAME,
  alternateName: ["AgroAI Odisha", "AgroAI Kalinga"],
  url: SITE_URL,
  logo: `${SITE_URL}/icon.svg`,
  description:
    "AgroAI is a farm-technology startup building land security and plant guidance for small farms in Odisha (Kalinga).",
  foundingLocation: {
    "@type": "Place",
    name: "Kalahandi, Odisha, India",
  },
  address: {
    "@type": "PostalAddress",
    addressLocality: "Kalahandi",
    addressRegion: "Odisha",
    addressCountry: "IN",
  },
  areaServed: [
    { "@type": "State", name: "Odisha" },
    { "@type": "Place", name: "Kalinga" },
    { "@type": "Place", name: "Kalahandi" },
  ],
  knowsAbout: [
    "Agriculture in Odisha",
    "Small and marginal farming",
    "Farm boundary mapping",
    "Crop-stage guidance",
    "Plant disease detection",
    "Odia language interfaces",
  ],
  sameAs: [SITE_GITHUB],
};

export const websiteNode = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: SITE_URL,
  name: SITE_NAME,
  alternateName: "AgroAI Odisha",
  description: SITE_DESCRIPTION,
  inLanguage: ["en-IN", "or-IN"],
  publisher: { "@id": ORGANIZATION_ID },
};

export const softwareApplicationNode = {
  "@type": "SoftwareApplication",
  "@id": APP_ID,
  name: SITE_NAME,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Agriculture",
  operatingSystem: "Web browser on a phone or desktop",
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  inLanguage: ["en-IN", "or-IN"],
  featureList: [
    "Satellite farm-boundary mapping with area in acres and hectares",
    "Spare-phone field camera with on-device person and animal detection",
    "Hyper-local seven-day weather and field-work windows",
    "Crop-day guide with a weekly action plan",
    "Plant-photo disease and pest scans",
    "Soil Health Card input and crop-fit ranking",
  ],
  publisher: { "@id": ORGANIZATION_ID },
};

export const homePageSchema = {
  "@context": "https://schema.org",
  "@graph": [
    organizationNode,
    websiteNode,
    softwareApplicationNode,
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: `${SITE_URL}/`,
      name: SITE_TITLE,
      description: SITE_DESCRIPTION,
      isPartOf: { "@id": WEBSITE_ID },
      about: { "@id": ORGANIZATION_ID },
      inLanguage: "en-IN",
    },
  ],
};

export interface FaqEntry {
  question: string;
  answer: string;
}

/** Graph for the Odisha/Kalinga landing page: org, page, breadcrumb, FAQ. */
export function odishaPageSchema({
  pageUrl,
  pageTitle,
  pageDescription,
  faqs,
}: {
  pageUrl: string;
  pageTitle: string;
  pageDescription: string;
  faqs: FaqEntry[];
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationNode,
      websiteNode,
      {
        "@type": "WebPage",
        "@id": `${pageUrl}#webpage`,
        url: pageUrl,
        name: pageTitle,
        description: pageDescription,
        isPartOf: { "@id": WEBSITE_ID },
        about: { "@id": ORGANIZATION_ID },
        inLanguage: "en-IN",
        breadcrumb: { "@id": `${pageUrl}#breadcrumb` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: `${SITE_URL}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Odisha & Kalinga",
            item: pageUrl,
          },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        mainEntity: faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };
}
