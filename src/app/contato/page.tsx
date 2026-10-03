import type { Metadata } from 'next';
import { getSession } from '@kizuna/core/server';
import { PageHeader } from '@kizuna/core/client/components/ui-better-soft/headers/page-header';
import { TicketCreateForm } from '@kizuna/core/client/components/tickets/ticket-create-form';

export const metadata: Metadata = {
  title: 'Contato',
  description: 'Fale com a equipe: abra um chamado e acompanhe a resposta.',
};

// Plugin tickets — página de contato PÚBLICA. É o mesmo formulário de /painel/chamados/novo:
// logado não informa nome/e-mail/telefone (vêm da conta); visitante informa. O chamado pertence ao
// e-mail e a resposta é acompanhada no painel (o link do chamado pede login e volta para ele).
export default async function ContatoPage() {
  const session = await getSession();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <PageHeader
        title="Contato"
        description="Dúvida, problema ou sugestão? Abra um chamado e a equipe responde."
      />
      <TicketCreateForm authenticated={Boolean(session)} />
    </div>
  );
}
