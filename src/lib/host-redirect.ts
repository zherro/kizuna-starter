/**
 * 301 dos domínios alternativos (ex.: `boracuiaba.com.br`, `www.*`) para o domínio canônico
 * (`site.url`), mantendo caminho e query. Só os hosts listados redirecionam — localhost, IP e o
 * health check do Dokploy passam direto. `keepPaths` (ex.: `/ads.txt`, `/robots.txt`) seguem 200 em
 * todos os domínios. Função pura e barata: uma busca num Set por requisição.
 */
export type HostRedirectConfig = {
  /** URL canônica (`https://boracuiaba.com`). */
  canonical: string;
  hosts: ReadonlySet<string>;
  keepPaths: ReadonlySet<string>;
};

export function buildHostRedirectConfig(
  siteUrl: string | undefined,
  hosts: string[] | undefined,
  keepPaths: string[] | undefined,
  env: string | undefined
): HostRedirectConfig | null {
  if (!siteUrl || !hosts?.length || /^(off|false|0)$/i.test(env ?? '')) return null;
  const canonical = siteUrl.replace(/\/$/, '');
  const canonicalHost = new URL(canonical).host.toLowerCase();
  const set = new Set(hosts.map((h) => h.trim().toLowerCase()).filter((h) => h && h !== canonicalHost));
  return set.size ? { canonical, hosts: set, keepPaths: new Set(keepPaths ?? []) } : null;
}

/** URL de destino do 301, ou `null` para seguir normalmente. `host` pode vir com porta. */
export function hostRedirectTarget(
  cfg: HostRedirectConfig | null,
  host: string | null,
  pathname: string,
  search: string
): string | null {
  if (!cfg || !host) return null;
  const name = host.split(':')[0].toLowerCase().replace(/\.$/, '');
  if (!cfg.hosts.has(name) || cfg.keepPaths.has(pathname)) return null;
  return `${cfg.canonical}${pathname}${search}`;
}
