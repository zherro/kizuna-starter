import { createAuthProvidersHandler, type OtpConfig } from '@kizuna/core/server';
import cfg from '@/../kizuna.config.json';

export const runtime = 'nodejs';

export const GET = createAuthProvidersHandler({ otp: (cfg as { otp?: OtpConfig }).otp });
