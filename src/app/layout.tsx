import type { Metadata, Viewport } from 'next';
import { Roboto, Geist_Mono, Bricolage_Grotesque, Quicksand, Baloo_2 } from 'next/font/google';
import {
  Briefcase,
  Compass,
  Home,
  LogIn,
  Megaphone,
  PlusCircle,
  Search,
  UserCircle,
} from 'lucide-react';
import { PwaRegister } from '@kizuna/core/client/components/pwa-register';
import {
  MobileTabBar,
  type MobileTabItem,
} from '@kizuna/core/client/components/ui-better-soft/mobile-tab-bar';
import { PreferencesFab } from '@kizuna/core/client/components/preferences-fab';
import { AppPreferencesProvider } from '@kizuna/core/client/providers/app-preferences-provider';
import { ACTIVE_UI_STYLE } from '@kizuna/core/client/lib/ui-theme';
import { isThemeColor } from '@kizuna/core/shared/theme-colors';
import { isDisplayFont } from '@kizuna/core/shared/display-fonts';
import { AuthProvider } from '@kizuna/core/client/providers/auth-provider';
import { KizunaHeader } from '@kizuna/core/client/components/kizuna-header';
import { Footer } from '@/components/footer';
import { CityCookieSync } from '@/components/city-cookie-sync';
import { ViewingCityProvider } from '@kizuna/core/client/components/viewing-city';
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

// Fonte de títulos — chave "theme.displayFont" (lista em DISPLAY_FONTS). Sem ela, vale o default do
// estilo (soft = Baloo 2, classic = Quicksand), definido em globals.css.
const displayFontCfg = (cfg as { theme?: { displayFont?: string } }).theme?.displayFont;
const displayFont = isDisplayFont(displayFontCfg) ? displayFontCfg : undefined;

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

// Fonte de títulos do estilo soft (default da lista curada em DISPLAY_FONTS) — ver --ui-font-display-active.
const baloo = Baloo_2({
  variable: '--font-baloo',
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

// Primeiros 3 itens da barra inferior (mobile), iguais para logado e visitante. "Anunciar" é o CTA
// central — o visitante vai ao login e volta (requiresAuth).
const tabsCommon: MobileTabItem[] = [
  { href: '/', label: 'Início', icon: <Home /> },
  { href: '/busca', label: 'Buscar', icon: <Search /> },
  {
    href: '/painel/meus-servicos/novo',
    label: 'Anunciar',
    icon: <PlusCircle />,
    featured: true,
    requiresAuth: true,
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang={site?.lang ?? 'pt-BR'}
      data-theme-color={defaultThemeColor}
      // `data-ui-style` (NEXT_PUBLIC_UI_STYLE) é fixo por deploy: resolvido no servidor, sem flash —
      // ao contrário de `data-theme-color`, que o provider do cliente pode trocar.
      data-ui-style={ACTIVE_UI_STYLE}
      data-display-font={displayFont}
      suppressHydrationWarning
      className={`${robotoSans.variable} ${geistMono.variable} ${bricolage.variable} ${quicksand.variable} ${baloo.variable} h-full antialiased`}
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
            <ViewingCityProvider>
            <PwaRegister swUrl="/sw.js?v=1" migrationKey="kizuna-sw-v1" />
            <CityCookieSync />
            {/* Variante vem de kizuna.config.json (header.variant: classic|compact). */}
            <KizunaHeader
              variant={headerVariant}
              showThemeToggle={false}
              authCta="single"
              brandLabel={siteName}
              brandLogo={site?.logo ?? undefined}
              actions={cfg.weather ? <WeatherWidget mini={headerVariant === 'classic'} /> : undefined}
              navLinks={[
                { href: '/busca', label: 'Buscar', icon: <Search /> },
                { href: '/painel', label: 'Anunciar', icon: <Megaphone /> },
              ]}
            />
            {/* pb: reserva o espaço da barra inferior no mobile (--mobile-tab-h é publicado pelo MobileTabBar). */}
            {/* A página que tiver um filho direto `data-fill` ocupa toda a altura útil (ex.: /login). */}
            <main className="flex-1 pb-[var(--mobile-tab-h,0px)] md:pb-0 [&:has(>[data-fill])]:flex [&:has(>[data-fill])]:flex-col">
              {children}
            </main>
            <Footer />
            <MobileTabBar
              // Wizard/onboarding têm rodapé próprio de navegação — a barra some neles.
              hideOn={['/painel/meus-servicos/novo', '/painel/onboarding']}
              items={[
                ...tabsCommon,
                {
                  href: '/painel/meus-servicos',
                  label: 'Meus anúncios',
                  icon: <Briefcase />,
                  exact: true,
                },
                { href: '/painel/minha-conta', label: 'Conta', icon: <UserCircle /> },
              ]}
              // Visitante: no lugar de "Meus anúncios"/"Conta" (que só levariam ao login), Descobrir e Entrar.
              guestItems={[
                ...tabsCommon,
                { href: '/descobrir', label: 'Descobrir', icon: <Compass /> },
                {
                  href: '/login',
                  label: 'Entrar',
                  icon: <LogIn />,
                  match: ['/login', '/registre-se'],
                },
              ]}
            />
            <PreferencesFab />
            <Toaster richColors position="bottom-center" />
            </ViewingCityProvider>
          </AuthProvider>
        </AppPreferencesProvider>
      </body>
    </html>
  );
}
