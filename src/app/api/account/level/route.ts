import { createAccountLevelHandler } from '@kizuna/core/server';
import { accountLevelsSetup } from '@/lib/server/account-levels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createAccountLevelHandler(accountLevelsSetup);
