import { createAnalyticsPageViewHandler } from '@kizuna/core/server';
import { analyticsConfig } from '@/lib/analytics';

export const runtime = 'nodejs';

// Visita de página (page_view) com cidade do portal, aparelho e utm_*. Ver plugin analytics (0005).
// Painel e API não contam (o cliente e este handler barram os dois).
export const POST = createAnalyticsPageViewHandler({ config: analyticsConfig });
