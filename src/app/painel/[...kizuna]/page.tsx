import { resolveKizunaScreen } from '@kizuna/core/client/components/screen-engine/resolve-kizuna-screen';

type PageProps = { params: Promise<{ kizuna: string[] }> };

export default async function KizunaScreenPage({ params }: Readonly<PageProps>) {
  const { kizuna } = await params;
  const { Component } = await resolveKizunaScreen(kizuna);
  return <Component />;
}
