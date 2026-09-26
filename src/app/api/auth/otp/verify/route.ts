import { createOtpVerifyHandler, pgrstRpc, type OtpConfig } from '@kizuna/core/server';
import cfg from '@/../kizuna.config.json';

export const runtime = 'nodejs';

export const POST = createOtpVerifyHandler(pgrstRpc, {
  config: (cfg as { otp?: OtpConfig }).otp,
});
