"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppPreferences } from "@kizuna/core/client/providers/app-preferences-provider";
import { Button } from "@kizuna/core/client/components/ui/button";
import { GitBranchIcon, Moon, Sun } from "lucide-react";
import cfg from "@/../kizuna.config.json";

// Versão do app (env APP_VERSION, incrementada por push) + versão do core — ver next.config.ts.
const appVersion = [
  process.env.APP_VERSION,
  process.env.KIZUNA_CORE_VERSION && `core ${process.env.KIZUNA_CORE_VERSION}`,
]
  .filter(Boolean)
  .join(" · ");

// Marca do site — bloco "site" do kizuna.config.json (mesma logo do header).
const siteLogo = cfg.site?.logo ?? undefined;

const AUTH_ROUTES = new Set(["/login", "/registre-se"]);

export function Footer() {
  const pathname = usePathname();
  const isPainelRoute = pathname.startsWith("/painel");
  // Telas de entrada: sem rodapé, para o foco ficar no formulário.
  const isAuthRoute = AUTH_ROUTES.has(pathname.replace(/\/+$/, ""));

  const {
    language,
    setLanguage,
    languageNames,
    languages,
    resolvedTheme,
    setTheme,
    themeColor,
    setThemeColor,
    themeColorSelectable,
    messages,
  } = useAppPreferences();

  // Rendered globally from the root layout; the painel has its own shell/chrome.
  if (isPainelRoute || isAuthRoute) return null;

  const currentYear = new Date().getFullYear();
  const siteName = cfg.site?.name ?? messages.nav.title;

  const navLinks = [
    { href: "/", label: messages.nav.home },
    { href: "/painel", label: messages.default.dashboard },
    { href: "/painel/taxonomia/categorias", label: messages.footer.categories },
    { href: "/eleicao", label: messages.election.footerLink },
    { href: "/sobre", label: messages.footer.about },
    { href: "/contato", label: messages.nav.contact },
    { href: "/privacidade", label: messages.footer.privacy },
    { href: "/termos", label: messages.footer.terms },
    { href: "/login", label: messages.nav.login },
    { href: "/registre-se", label: messages.nav.signUp },
  ];

  const themeColors = [
    { value: "blue", label: messages.nav.blue },
    { value: "green", label: messages.nav.green },
    { value: "purple", label: messages.nav.purple },
    { value: "teal", label: messages.nav.teal },
    { value: "red", label: messages.nav.red },
    { value: "orange", label: messages.nav.orange },
    { value: "coral", label: messages.nav.coral },
  ];

  const socialLinks = [
    { href: "https://github.com", label: "GitHub", icon: GitBranchIcon },
    { href: "https://twitter.com", label: "Twitter", icon: GitBranchIcon },
    { href: "https://instagram.com", label: "Instagram", icon: GitBranchIcon },
    { href: "https://linkedin.com", label: "LinkedIn", icon: GitBranchIcon },
  ];

  return (
    <footer className="border-t border-border/70 bg-background/90">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-10">
        {/* 3-column grid: 1 col mobile → 2 cols sm → 3 cols md */}
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-3">
          {/* Col 1 — Brand + Preferences */}
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-3">
              {siteLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={siteLogo} alt={siteName} className="h-16 w-auto" />
              ) : (
                <>
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold tracking-tight">
                    {siteName}
                  </span>
                </>
              )}
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {messages.footer.tagline}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {themeColorSelectable && (
                <select
                  value={themeColor}
                  onChange={(e) =>
                    setThemeColor(e.target.value as typeof themeColor)
                  }
                  aria-label={messages.nav.color}
                  className="h-9 rounded-[var(--ui-radius-field,0.375rem)] border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                >
                  {themeColors.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}

              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
                aria-label={messages.nav.language}
                className="h-9 rounded-[var(--ui-radius-field,0.375rem)] border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
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
                onClick={() =>
                  setTheme(resolvedTheme === "dark" ? "light" : "dark")
                }
              >
                {resolvedTheme === "dark" ? (
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
              {messages.footer.navigation}
            </p>
            <div className="grid grid-flow-col grid-rows-5 gap-x-6 gap-y-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href + link.label}
                  href={link.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>

          {/* Col 3 — Social */}
          <div className="flex flex-col gap-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {messages.footer.social}
            </p>
            <div className="flex flex-wrap gap-2">
              {socialLinks.map(({ href, label, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--ui-radius-pill,0.375rem)] border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Citação */}
        <figure className="mt-8 mx-auto max-w-[772px] text-center">
          <blockquote className="text-sm italic leading-relaxed text-muted-foreground">
            “Por isso louvei a alegria, porque nada há melhor para o homem debaixo do sol,
            do que comer, e beber, e alegrar-se; porque isso o acompanhará no seu
            trabalho, nos dias da sua vida, que Deus lhe deu debaixo do sol.”
          </blockquote>
          <figcaption className="mt-2 text-xs text-muted-foreground">
            Eclesiastes 8:15 · Almeida
          </figcaption>
        </figure>

        {/* Divider + copyright */}
        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-border/70 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {currentYear} {siteName}. {messages.footer.rights}
            {appVersion && (
              <span className="ml-2 opacity-70">v{appVersion}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {"weather" in cfg && (
              <>
                {messages.footer.weatherCredit}:{" "}
                <a
                  href="https://open-meteo.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Open-Meteo
                </a>
                {" · "}
              </>
            )}
            {messages.footer.madeWith}
          </p>
        </div>
      </div>
    </footer>
  );
}
