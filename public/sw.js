// Service worker mínimo — registrado pelo <PwaRegister /> no layout.
// Não faz cache: só existe para o app ser instalável como PWA.
// Para cache offline, adicione aqui um handler de 'fetch'.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
