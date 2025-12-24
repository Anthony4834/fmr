export default function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID || process.env.NEXT_PUBLIC_GTAG_ID;
  if (!gaId) return null;

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}', { anonymize_ip: true });
`.trim(),
        }}
      />
    </>
  );
}






