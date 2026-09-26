import '@/app/global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter } from 'next/font/google';
import 'katex/dist/katex.css';
import { AISearchTrigger } from '@/components/search';
import { ThemeFavicon } from '@/components/theme-favicon';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  icons: {
    icon: [{ url: '/favicon-light.svg', type: 'image/svg+xml' }],
  },
};

const inter = Inter({
  subsets: ['latin'],
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <AISearchTrigger />
        <RootProvider>
          <ThemeFavicon />
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
