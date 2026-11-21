import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mockUseAuth = vi.fn(() => ({ user: null as unknown, loading: false }));
vi.mock('@kizuna/core/client/providers/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

import { AnuncieActions } from './anuncie-parts';
import { CONTACT_EMAIL, CREATE_AD_HREF, WHATSAPP_NUMBER, contactFor, type Contact } from '@/lib/anuncie';

const whatsapp: Contact = { kind: 'whatsapp', label: 'Falar no WhatsApp', href: 'https://wa.me/5565999990000?text=Oi' };

describe('/anuncie: botões', () => {
  it('"Anunciar grátis" leva o visitante ao login e de volta ao criar anúncio', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    const html = renderToStaticMarkup(<AnuncieActions contact={null} />);
    expect(CREATE_AD_HREF).toBe('/painel/meus-servicos/novo');
    expect(html).toContain('Anunciar grátis');
    expect(html).toContain(`href="/login?returnTo=${encodeURIComponent(CREATE_AD_HREF)}"`);
  });

  it('logado, "Anunciar grátis" vai direto ao criar anúncio', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
    const html = renderToStaticMarkup(<AnuncieActions contact={null} />);
    expect(html).toContain(`href="${CREATE_AD_HREF}"`);
  });

  it('sem número de WhatsApp, o botão "Falar no WhatsApp" não aparece', () => {
    const html = renderToStaticMarkup(<AnuncieActions contact={null} />);
    expect(html).not.toContain('WhatsApp');
    expect(html).not.toContain('wa.me');
    expect(html).toContain('Veja o Bora funcionando');
  });

  it('com número, aparece "Falar no WhatsApp" ao lado do principal', () => {
    const html = renderToStaticMarkup(<AnuncieActions contact={whatsapp} />);
    expect(html).toContain('Falar no WhatsApp');
    expect(html).toContain('href="https://wa.me/5565999990000?text=Oi"');
    expect(html.indexOf('Anunciar grátis')).toBeLessThan(html.indexOf('Falar no WhatsApp'));
  });

  it('canal de contato só existe com anuncie.whatsapp (ou email) preenchido no kizuna.config.json', () => {
    const contact = contactFor('Oi');
    if (WHATSAPP_NUMBER) expect(contact?.kind).toBe('whatsapp');
    else if (CONTACT_EMAIL) expect(contact?.kind).toBe('email');
    else expect(contact).toBeNull();
  });
});
