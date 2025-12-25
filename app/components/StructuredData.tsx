export default function StructuredData() {
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'fmr.fyi',
    url: 'https://fmr.fyi',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://fmr.fyi/?q={search_term_string}&type=city',
      },
      'query-input': 'required name=search_term_string',
    },
  };

  const dataset = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'HUD Fair Market Rent (FMR) and Small Area Fair Market Rent (SAFMR)',
    description:
      'Fair Market Rent and Small Area Fair Market Rent values published by the U.S. Department of Housing and Urban Development (HUD), surfaced by fmr.fyi.',
    url: 'https://fmr.fyi/data-sources',
    creator: {
      '@type': 'Organization',
      name: 'U.S. Department of Housing and Urban Development (HUD)',
    },
    publisher: {
      '@type': 'Organization',
      name: 'fmr.fyi',
      url: 'https://fmr.fyi',
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(website) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dataset) }} />
    </>
  );
}








