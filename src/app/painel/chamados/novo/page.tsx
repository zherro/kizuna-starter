import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { PageHeader } from '@kizuna/core/client/components/ui-better-soft/headers/page-header';
import { TicketCreateForm } from '@kizuna/core/client/components/tickets/ticket-create-form';

// Plugin tickets — abrir chamado de suporte.
export default async function NovoChamadoPage() {
  if (!(await getSession())) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <PageHeader
        title="Novo chamado"
        description="Conte o que aconteceu. A equipe responde aqui."
      />
      <TicketCreateForm />
    </div>
  );
}
