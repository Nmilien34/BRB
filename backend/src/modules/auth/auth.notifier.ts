import { logger } from '../../utils/index.js';

interface SendOtpInput {
  phoneE164: string;
  code: string;
}

export interface OtpNotifier {
  sendCode(input: SendOtpInput): Promise<void>;
}

export const otpNotifier: OtpNotifier = {
  async sendCode({ phoneE164, code }) {
    logger.info({ phoneE164, code }, 'Generated BRB OTP code');
  },
};
