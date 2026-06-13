/**
 * Cloudinary Service
 *
 * Centralized file upload service for the entire server.
 * Handles uploads to Cloudinary with server-side validation.
 *
 * Uploads go to private folders by default — URLs require signed access.
 * Public assets (avatars, learning covers) use a separate method.
 *
 * Validation enforced here: images only, max 5MB.
 * Never trusts client-side validation.
 */

import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
  ];

  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: configService.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  /**
   * Uploads a file buffer to Cloudinary.
   *
   * @param file - The file buffer and mimetype from multer
   * @param folder - Cloudinary folder path (e.g., 'broker-documents')
   * @param publicId - Optional public_id for the uploaded asset
   * @returns The Cloudinary upload response
   */
  async uploadFile(
    file: { buffer: Buffer; mimetype: string; originalname: string },
    folder: string,
    publicId?: string,
  ): Promise<UploadApiResponse> {
    this.validateFile(file);

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'image',
          access_mode: 'authenticated', // Private — requires signed URL
          type: 'authenticated',
        },
        (error, result) => {
          if (error) {
            this.logger.error(`Cloudinary upload failed: ${error.message}`);
            reject(
              new BadRequestException({
                code: 'UPLOAD_FAILED',
                message: 'File upload failed. Please try again.',
              }),
            );
          } else {
            resolve(result!);
          }
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  /**
   * Generates a signed URL for a private Cloudinary asset.
   * Used to grant temporary access to broker documents and receipts.
   */
  generateSignedUrl(publicId: string): string {
    return cloudinary.url(publicId, {
      type: 'authenticated',
      sign_url: true,
      secure: true,
    });
  }

  /**
   * Deletes an asset from Cloudinary by public_id.
   */
  async deleteFile(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { type: 'authenticated' });
    } catch (error) {
      this.logger.error(`Cloudinary delete failed: ${error}`);
    }
  }

  /**
   * Server-side file validation — images only, max 5MB.
   * Never trust client-side validation alone.
   */
  private validateFile(file: {
    buffer: Buffer;
    mimetype: string;
  }): void {
    if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'Only JPEG, PNG, and WebP images are allowed.',
      });
    }

    if (file.buffer.length > this.MAX_FILE_SIZE) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'File size must be less than 5MB.',
      });
    }
  }
}