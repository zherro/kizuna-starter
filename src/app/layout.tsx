import type { Metadata, Viewport } from 'next';
import { Roboto, Geist_Mono, Bricolage_Grotesque, Quicksand } from 'next/font/google';
import { Megaphone, Search } from 'lucide-react';
import { PwaRegister } from '@kizuna/core/client/components/pwa-register';
import { PreferencesFab } from '@kizuna/core/client/components/preferences-fab';
import { AppPreferencesProvider } from '@kizuna/core/client/providers/app-preferences-provider';
import { isThemeColor } from '@kizuna/core/shared/theme-colors';
import { AuthProvider } from '@kizuna/core/client/providers/auth-provider';
import { KizunaHeader } from '@kizuna/core/client/components/kizuna-header';
import { Footer } from '@/components/footer';
import { WeatherWidget } from '@kizuna/core/client/components/weather/weather-widget';
import { Toaster } from 'sonner';
import cfg from '@/../kizuna.config.json';
import './globals.css';

const headerCfg = (cfg as { header?: { variant?: string } }).header;
const headerVariant = headerCfg?.variant === 'compact' ? 'compact' : 'classic';

// Tema padrão e se o usuário pode trocá-lo — chave "theme" do kizuna.config.json
// (lista de temas disponíveis no _comment de lá).
const defaultThemeColor = isThemeColor(cfg.theme?.default) ? cfg.theme.default : 'blue';
const themeColorSelectable = cfg.theme?.selectable !== false;

// EXEMPLO — reescreva as fontes/metadata/nav do seu app.
//
// IMPORTANTE: este layout NÃO lê `cookies()`/`getSession()` de propósito — assim
// as páginas públicas (/, /[slug], /busca) podem ser estáticas/ISR. Quem precisa
// da sessão no servidor é o layout de /painel. Aqui o `AuthProvider` recebe
// `initialUser={null}` e hidrata sozinho via `GET /api/auth/me` no cliente.
// A trava de ambiente (falta de PostgREST/JWT) roda no proxy, não aqui.
// Ver docs/HARDENING.md.

const robotoSans = Roboto({
  variable: '--font-roboto',
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const bricolage = Bricolage_Grotesque({
  variable: '--font-bricolage',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
});

// Fonte de títulos (Typography font="display") — ver --font-display em globals.css.
// Geométrica/arredondada como a Roboto do corpo, então título e texto combinam sem "brigar".
const quicksand = Quicksand({
  variable: '--font-quicksand',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
});

const site = cfg.site;
const siteName = site?.name ?? 'Kizuna';

// SEO — vem do bloco "site" do kizuna.config.json.
export const metadata: Metadata = {
  metadataBase: new URL(site?.url ?? 'http://localhost:3000'),
  title: { default: siteName, template: `%s | ${siteName}` },
  description: site?.description,
  applicationName: siteName,
  appleWebApp: { capable: true, title: site?.shortName ?? siteName, statusBarStyle: 'default' },
  openGraph: {
    type: 'website',
    siteName,
    title: siteName,
    description: site?.description,
    locale: (site?.lang ?? 'pt-BR').replace('-', '_'),
    url: '/',
  },
  twitter: { card: 'summary_large_image', title: siteName, description: site?.description },
};

export const viewport: Viewport = {
  themeColor: cfg.theme?.metaColor ?? '#2563eb',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={site?.lang ?? 'pt-BR'}
      data-theme-color={defaultThemeColor}
      suppressHydrationWarning
      className={`${robotoSans.variable} ${geistMono.variable} ${bricolage.variable} ${quicksand.variable} h-full antialiased`}
    >
      <body
        suppressHydrationWarning
        className="min-h-full flex flex-col bg-background text-foreground"
      >
        <AppPreferencesProvider
          defaultThemeColor={defaultThemeColor}
          themeColorSelectable={themeColorSelectable}
        >
          <AuthProvider initialUser={null}>
            <PwaRegister swUrl="/sw.js?v=1" migrationKey="kizuna-sw-v1" />
            {/* Variante vem de kizuna.config.json (header.variant: classic|compact). */}
            <KizunaHeader
              variant={headerVariant}
              showThemeToggle={false}
              authCta="single"
              brandLabel={siteName}
              brandLogo={site?.logo ?? undefined}
              actions={cfg.weather ? <WeatherWidget /> : undefined}
              navLinks={[
                { href: '/busca', label: 'Buscar', icon: <Search /> },
                { href: '/painel', label: 'Anunciar', icon: <Megaphone /> },
              ]}
            />
            <main className="flex-1">{children}</main>
            <Footer />
            <PreferencesFab />
            <Toaster richColors position="bottom-center" />
          </AuthProvider>
        </AppPreferencesProvider>
      </body>
    </html>
  );
}
