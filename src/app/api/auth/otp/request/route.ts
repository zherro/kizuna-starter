import { createOtpRequestHandler, pgrstRpc, type OtpConfig } from '@kizuna/core/server';
import cfg from '@/../kizuna.config.json';

export const runtime = 'nodejs';

export const POST = createOtpRequestHandler(pgrstRpc, {
  config: (cfg as { otp?: OtpConfig }).otp,
});
