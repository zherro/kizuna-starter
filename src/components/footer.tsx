'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppPreferences } from '@kizuna/core/client/providers/app-preferences-provider';
import { Button } from '@kizuna/core/client/components/ui/button';
import { GitBranchIcon, Moon, Sun } from 'lucide-react';

export function Footer() {
  const pathname = usePathname();
  const isPainelRoute = pathname.startsWith('/painel');

  const {
    language,
    setLanguage,
    languageNames,
    languages,
    resolvedTheme,
    setTheme,
    themeColor,
    setThemeColor,
    messages,
  } = useAppPreferences();

  // Rendered globally from the root layout; the painel has its own shell/chrome.
  if (isPainelRoute) return null;

  const currentYear = new Date().getFullYear();

  const navLinks = [
    { href: '/', label: messages.nav.home },
    { href: '/painel', label: 'Painel' },
    { href: '/painel/taxonomia/categorias', label: 'Categorias' },
    { href: '#', label: messages.nav.contact },
    { href: '/login', label: 'Login' },
    { href: '/registre-se', label: 'Registre-se' },
  ];

  const themeColors = [
    { value: 'blue', label: messages.nav.blue },
    { value: 'green', label: messages.nav.green },
    { value: 'purple', label: messages.nav.purple },
    { value: 'teal', label: messages.nav.teal },
    { value: 'red', label: messages.nav.red },
    { value: 'orange', label: messages.nav.orange },
    { value: 'coral', label: messages.nav.coral },
  ];

  const socialLinks = [
    { href: 'https://github.com', label: 'GitHub', icon: GitBranchIcon },
    { href: 'https://twitter.com', label: 'Twitter', icon: GitBranchIcon },
    { href: 'https://instagram.com', label: 'Instagram', icon: GitBranchIcon },
    { href: 'https://linkedin.com', label: 'LinkedIn', icon: GitBranchIcon },
  ];

  return (
    <footer className="border-t border-border/70 bg-background/90">
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        {/* 3-column grid: 1 col mobile → 2 cols sm → 3 cols md */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-3">
          {/* Col 1 — Brand + Preferences */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full bg-primary"
                aria-hidden="true"
              />
              <span className="text-sm font-semibold tracking-tight">{messages.nav.title}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Gerencie seus anúncios com facilidade.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value as typeof themeColor)}
                aria-label={messages.nav.color}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {themeColors.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>

              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
                aria-label={messages.nav.language}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                {languages.map((item) => (
                  <option key={item} value={item}>
                    {languageNames[item]}
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                size="icon"
                aria-label={messages.nav.theme}
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Col 2 — Navigation */}
          <nav className="flex flex-col gap-2">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Navegação
            </p>
            {navLinks.map((link) => (
              <Link
                key={link.href + link.label}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Col 3 — Social */}
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Redes sociais
            </p>
            <div className="flex flex-wrap gap-2">
              {socialLinks.map(({ href, label, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Divider + copyright */}
        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-border/70 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {currentYear} {messages.nav.title}. Todos os direitos reservados.
          </p>
          <p className="text-xs text-muted-foreground">Feito com ♥</p>
        </div>
      </div>
    </footer>
  );
}
