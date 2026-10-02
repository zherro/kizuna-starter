import { redirect } from 'next/navigation';
import { getSession } from '@kizuna/core/server';
import { TicketDetail } from '@kizuna/core/client/components/tickets/ticket-detail';
import { viewerFromSession } from '@kizuna/core/client/components/tickets/viewer';

// Plugin tickets — detalhe + comentários. A RLS barra chamado alheio (a tela mostra "não encontrado").
export default async function ChamadoPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <TicketDetail ticketId={id} viewer={viewerFromSession(session)} />
    </div>
  );
}
