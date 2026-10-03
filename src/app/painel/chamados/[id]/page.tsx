import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { TicketDetail } from '@kizuna/core/client/components/tickets/ticket-detail';
import { viewerFromSession } from '@kizuna/core/client/components/tickets/viewer';

// Plugin tickets — detalhe + comentários. A RLS barra chamado alheio (a tela mostra "não encontrado").
export default async function ChamadoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  // Link compartilhável: sem login, entra e volta para este chamado.
  if (!session) redirect(`/login?returnTo=${encodeURIComponent(`/painel/chamados/${id}`)}`);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <TicketDetail ticketId={id} viewer={viewerFromSession(session)} />
    </div>
  );
}
