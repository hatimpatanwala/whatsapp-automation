import { registerAs } from '@nestjs/config';

export default registerAs('s3', () => ({
  region: process.env.AWS_REGION || 'ap-south-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  bucket: process.env.S3_BUCKET || 'whatsapp-commerce-media',
  cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN || '',
}));
