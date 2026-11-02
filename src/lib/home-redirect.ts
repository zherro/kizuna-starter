// Decide, sem banco, pra onde a `/` redireciona. Pura: roda no proxy (edge) antes de qualquer
// render, então a 1ª resposta é um 307 barato em vez de uma página dinâmica com cookies()+banco.
import { isRoutableSlug } from '@kizuna/core/shared/city-routing/city-slug';

export function resolveHomeRedirect(opts: {
  cookie?: string | null;
  outsideList?: string | null;
  defaultCitySlug?: string | null;
}): string | null {
  const { cookie, outsideList, defaultCitySlug } = opts;
  if (cookie && isRoutableSlug(cookie)) return `/${cookie}`;
  if (outsideList === 'default' && defaultCitySlug && isRoutableSlug(defaultCitySlug)) {
    return `/${defaultCitySlug}`;
  }
  return null;
}
