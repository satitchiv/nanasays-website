import type { Metadata } from "next";
import { Nunito, Nunito_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import IconSprite from "@/components/IconSprite";
import { LanguageProvider } from "@/components/LanguageProvider";
import SiteTracker from "@/components/SiteTracker";

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-nunito',
  display: 'swap',
})

const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-nunito-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s | NanaSays',
    default: 'NanaSays — Ask Nana. Find the right school.',
  },
  description: 'NanaSays helps international families find the perfect school abroad. Search 10,000+ verified schools across 100+ countries with Nana, your AI school advisor.',
  keywords: ['international school', 'boarding school', 'IB school', 'school abroad', 'international school directory'],
  openGraph: {
    siteName: 'NanaSays',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    site: '@nanasays',
  },
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'NanaSays',
  url: 'https://nanasays.school',
  description: 'NanaSays helps international families find the right school abroad. Search 10,000+ verified schools across 100+ countries with Nana, your AI school advisor. See nanasays.school/methodology for data sourcing details.',
  logo: 'https://nanasays.school/nana-logo.png',
  foundingDate: '2025',
  areaServed: 'Worldwide',
  sameAs: [
    'https://www.facebook.com/nanasays',
    'https://www.instagram.com/nanasays',
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

  return (
    <html lang="en" className={`${nunito.variable} ${nunitoSans.variable}`}>
      <body style={{ fontFamily: 'var(--font-nunito-sans), sans-serif' }}>
        {/* Google Analytics 4 — add NEXT_PUBLIC_GA_MEASUREMENT_ID to Netlify env vars */}
        {gaMeasurementId && (
          <>
            <Script
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaMeasurementId}');`}
            </Script>
          </>
        )}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <LanguageProvider>
          <IconSprite />
          <SiteTracker />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
