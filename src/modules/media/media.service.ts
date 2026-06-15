import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

// Only allow safe, non-executable media types; never text/html or SVG (stored XSS).
const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
]);

@Injectable()
export class MediaService {
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;
  private readonly cloudfrontDomain: string;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId = configService.get<string>('AWS_ACCESS_KEY_ID', '');
    const secretAccessKey = configService.get<string>('AWS_SECRET_ACCESS_KEY', '');

    const s3Config: any = {
      region: configService.get<string>('AWS_REGION', 'ap-south-1'),
    };

    // Only set explicit credentials if provided — otherwise SDK uses IAM role / instance profile
    if (accessKeyId && secretAccessKey) {
      s3Config.credentials = { accessKeyId, secretAccessKey };
    }

    this.s3Client = new S3Client(s3Config);
    this.bucket = configService.get<string>('S3_BUCKET', 'whatsapp-commerce-media');
    this.region = configService.get<string>('AWS_REGION', 'ap-south-1');
    this.cloudfrontDomain = configService.get<string>('CLOUDFRONT_DOMAIN', '');
  }

  async getPresignedUploadUrl(tenantSchema: string, fileName: string, contentType: string): Promise<{ uploadUrl: string; fileUrl: string }> {
    if (!ALLOWED_CONTENT_TYPES.has((contentType || '').toLowerCase())) {
      throw new BadRequestException('Unsupported file type. Allowed: JPEG, PNG, WebP, GIF, PDF.');
    }
    // Strip any path components from the client-supplied filename.
    const safeName = (fileName || 'file').replace(/[/\\]/g, '_').replace(/[^\w.\-]/g, '_').slice(0, 100);
    const key = `${tenantSchema}/${uuidv4()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      // Force download rather than inline render, neutralising any residual HTML/script.
      ContentDisposition: 'attachment',
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 600 });
    const fileUrl = this.cloudfrontDomain
      ? `https://${this.cloudfrontDomain}/${key}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    return { uploadUrl, fileUrl };
  }

  async uploadBuffer(tenantSchema: string, buffer: Buffer, fileName: string, contentType: string): Promise<string> {
    const key = `${tenantSchema}/${uuidv4()}-${fileName}`;

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));

    return this.cloudfrontDomain
      ? `https://${this.cloudfrontDomain}/${key}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
