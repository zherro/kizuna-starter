import { Suspense } from 'react';
import { ResetPasswordPageContent } from '@kizuna/core/client/components/reset-password-page';

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-10 md:px-6">
      <Suspense>
        <ResetPasswordPageContent />
      </Suspense>
    </div>
  );
}
