import type { Metadata, Viewport } from 'next';
import { Roboto, Geist_Mono, Bricolage_Grotesque, Playfair_Display, Inter } from 'next/font/google';
import { Megaphone, Search } from 'lucide-react';
import { PwaRegister } from '@kizuna/core/client/components/pwa-register';
import { PreferencesFab } from '@kizuna/core/client/components/preferences-fab';
import { AppPreferencesProvider } from '@kizuna/core/client/providers/app-preferences-provider';
import { isThemeColor } from '@kizuna/core/shared/theme-colors';
import { AuthProvider } from '@kizuna/core/client/providers/auth-provider';
import { KizunaHeader } from '@kizuna/core/client/components/kizuna-header';
import { Footer } from '@/components/footer';
import { Toaster } from 'sonner';
import cfg from '@/../kizuna.config.json';
import './globals.css';

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

// Usadas só pelo tema `bora_cuiaba` (globals.css troca --font-display/--font-body
// dentro daquele escopo) — não afetam o restante do app, que continua no
// Roboto/Bricolage acima.
const playfairDisplay = Playfair_Display({
  variable: '--font-playfair-display',
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
});

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Kizuna',
  description: 'Projeto sobre kizuna-core',
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      data-theme-color={defaultThemeColor}
      suppressHydrationWarning
      className={`${robotoSans.variable} ${geistMono.variable} ${bricolage.variable} ${playfairDisplay.variable} ${inter.variable} h-full antialiased`}
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
            {/* Variante fixada por env KIZUNA_HEADER_VARIANT (classic|compact). */}
            <KizunaHeader
              showThemeToggle={false}
              authCta="single"
              brandLabel="Kizuna"
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
