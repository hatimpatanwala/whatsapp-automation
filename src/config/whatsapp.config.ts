import { registerAs } from '@nestjs/config';

export default registerAs('whatsapp', () => ({
  apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
  apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com',
  appSecret: process.env.WHATSAPP_APP_SECRET || '',
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  rateLimitMax: parseInt(process.env.WHATSAPP_RATE_LIMIT_MAX || '70', 10),
  rateLimitDuration: parseInt(process.env.WHATSAPP_RATE_LIMIT_DURATION || '1000', 10),
}));
