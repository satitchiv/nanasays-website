import type { Metadata } from "next";
import { Nunito, Nunito_Sans } from "next/font/google";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import IconSprite from "@/components/IconSprite";
import { LanguageProvider } from "@/components/LanguageProvider";

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
  description: 'NanaSays helps Thai families find the perfect international school abroad. Search 990+ schools across 18 countries with Nana, your AI school advisor.',
  keywords: ['international school', 'Thai families', 'boarding school', 'IB school', 'school abroad'],
  openGraph: {
    siteName: 'NanaSays',
    type: 'website',
    locale: 'en_US',
  },
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'NanaSays',
  url: 'https://nanasays.com',
  description: 'NanaSays helps international families find the right school abroad. Search 990+ schools across 18 countries with Nana, your AI school advisor.',
  logo: 'https://nanasays.com/nana-logo.png',
  sameAs: [],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${nunito.variable} ${nunitoSans.variable}`}>
      <body style={{ fontFamily: 'var(--font-nunito-sans), sans-serif' }}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <LanguageProvider>
          <IconSprite />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
