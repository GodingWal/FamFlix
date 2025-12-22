import { Helmet } from "react-helmet-async";

export const SITE_NAME = "FamFlix";
export const BASE_URL = "https://famflixr.com";

export interface OpenGraphMeta {
  readonly title?: string;
  readonly description?: string;
  readonly url?: string;
  readonly type?: string;
  readonly image?: string;
  readonly siteName?: string;
}

export interface TwitterMeta {
  readonly card?: "summary" | "summary_large_image";
  readonly site?: string;
  readonly creator?: string;
  readonly title?: string;
  readonly description?: string;
  readonly image?: string;
}

export interface SeoProps {
  readonly title?: string;
  readonly description?: string;
  readonly canonical?: string;
  readonly openGraph?: OpenGraphMeta;
  readonly twitter?: TwitterMeta;
  readonly jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
  readonly noIndex?: boolean;
}

const DEFAULT_TITLE = `${SITE_NAME} | AI-powered family video creation platform`;
const DEFAULT_DESCRIPTION =
  "FamFlix helps families transform memories into cinematic stories with AI voice cloning, collaborative editing, and guided storytelling tools.";

function ensureArray<T>(value?: T | T[]): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function Seo({
  title,
  description,
  canonical,
  openGraph,
  twitter,
  jsonLd,
  noIndex,
}: SeoProps) {
  const pageTitle = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;
  const pageDescription = description ?? DEFAULT_DESCRIPTION;
  const canonicalUrl = canonical ?? BASE_URL;

  const og: OpenGraphMeta = {
    type: "website",
    siteName: SITE_NAME,
    url: canonicalUrl,
    title: pageTitle,
    description: pageDescription,
    ...openGraph,
  };

  const twitterMeta: TwitterMeta = {
    card: "summary_large_image",
    site: "@FamFlix",
    title: pageTitle,
    description: pageDescription,
    ...twitter,
  };

  const jsonLdPayload = ensureArray(jsonLd);

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={pageDescription} />
      <link rel="canonical" href={canonicalUrl} />
      {noIndex ? <meta name="robots" content="noindex, nofollow" /> : null}

      <meta property="og:type" content={og.type} />
      {og.siteName ? <meta property="og:site_name" content={og.siteName} /> : null}
      {og.url ? <meta property="og:url" content={og.url} /> : null}
      {og.title ? <meta property="og:title" content={og.title} /> : null}
      {og.description ? (
        <meta property="og:description" content={og.description} />
      ) : null}
      {og.image ? <meta property="og:image" content={og.image} /> : null}

      {twitterMeta.card ? <meta name="twitter:card" content={twitterMeta.card} /> : null}
      {twitterMeta.site ? <meta name="twitter:site" content={twitterMeta.site} /> : null}
      {twitterMeta.creator ? (
        <meta name="twitter:creator" content={twitterMeta.creator} />
      ) : null}
      {twitterMeta.title ? <meta name="twitter:title" content={twitterMeta.title} /> : null}
      {twitterMeta.description ? (
        <meta name="twitter:description" content={twitterMeta.description} />
      ) : null}
      {twitterMeta.image ? <meta name="twitter:image" content={twitterMeta.image} /> : null}

      {jsonLdPayload.map((schema, index) => (
        <script
          key={index}
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </Helmet>
  );
}

export default Seo;
