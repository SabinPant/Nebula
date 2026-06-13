/**
 * Broker Service
 *
 * All broker application and invitation business logic.
 * Composes BrokerRepository (database), CloudinaryService (file uploads),
 * and EmailService (notifications and setup links).
 *
 * Throws typed HttpExceptions — no try/catch except for the file upload
 * where multer/Cloudinary errors need mapping to domain errors.
 */

import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrokerRepository } from './broker.repository';
import { CloudinaryService } from '../../shared/services/cloudinary.service';
import { EmailService } from '../../shared/services/email.service';
import { CreateBrokerApplicationDto } from './dto/create-broker-application.dto';
import { randomUUID, createHash } from 'node:crypto';
import { PrismaService } from '../../core/database/prisma.service';

@Injectable()
export class BrokerService {
  constructor(
  private readonly brokerRepository: BrokerRepository,
  private readonly cloudinaryService: CloudinaryService,
  private readonly emailService: EmailService,
  private readonly configService: ConfigService,
  private readonly prisma: PrismaService,
) {}

  /**
   * Submits a new broker application with document upload.
   *
   * If the email already belongs to a user account, the application is still
   * created but flagged with existingUserId — Admin sees a warning badge.
   * The applicant always receives a 200 response, never a rejection.
   */
  async submitApplication(
    dto: CreateBrokerApplicationDto,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    // Check for duplicate application by phone
    const existingApp = await this.brokerRepository.findByEmail(dto.email);
    if (existingApp) {
      throw new ConflictException({
        code: 'DUPLICATE_APPLICATION',
        message:
          'You have already submitted an application. Please wait for review.',
      });
    }

    // Upload document to Cloudinary
    const uploadResult = await this.cloudinaryService.uploadFile(
      file,
      'broker-documents',
    );

    // Check if email matches an existing user account — flag for admin review
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null },
      select: { id: true },
    });

    const application = await this.brokerRepository.createApplication({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      dateOfBirth: dto.dateOfBirth,
      documentIdNumber: dto.documentIdNumber,
      documentUrl: uploadResult.secure_url,
      documentPublicId: uploadResult.public_id,
      reason: dto.reason,
      existingUserId: existingUser?.id,
    });

    // TODO: Notify admin about new application (Notification module in Sprint 13)

    return {
      statusCode: 200,
      message:
        'Application submitted successfully. You will receive an email when it has been reviewed.',
    };
  }

  /**
   * Checks the status of a broker application by email.
   */
  async checkStatus(email: string) {
    const application = await this.brokerRepository.findByEmail(email);

    if (!application) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'No application found for this email',
      });
    }

    return {
      status: application.status,
      submittedAt: application.createdAt,
      reviewedAt: application.reviewedAt,
      adminNote: application.adminNote,
    };
  }

  /**
   * Approves a broker application and sends a setup invitation.
   */
  async approveApplication(
    applicationId: string,
    adminId: string,
    brokerNumber: string,
    adminNote?: string,
  ) {
    const application = await this.brokerRepository.findById(applicationId);

    if (!application) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Application not found',
      });
    }

    if (application.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'APPLICATION_ALREADY_REVIEWED',
        message: 'This application has already been reviewed',
      });
    }

    // Generate invitation token
    const token = randomUUID();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    // Create invitation
    await this.brokerRepository.createInvitation({
      userId: adminId,
      email: application.email,
      brokerNumber,
      tokenHash,
      expiresAt,
    });

    // Update application status
    await this.brokerRepository.updateStatus(applicationId, {
      status: 'APPROVED',
      adminNote: adminNote || 'Approved',
      reviewedBy: adminId,
      reviewedAt: new Date(),
    });

    // Send setup email
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    await this.emailService.sendMail(
      application.email,
      'Your Nebula Broker Application Has Been Approved',
      `<p>Congratulations! Your application to become a broker has been approved.</p>
       <p><a href="${frontendUrl}/broker-setup?token=${token}">Set up your broker account</a></p>
       <p>This link expires in 48 hours.</p>`,
    );

    return { message: 'Application approved. Setup link sent.' };
  }

  /**
   * Rejects a broker application.
   */
  async rejectApplication(
    applicationId: string,
    adminId: string,
    adminNote: string,
  ) {
    const application = await this.brokerRepository.findById(applicationId);

    if (!application) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Application not found',
      });
    }

    if (application.status !== 'PENDING') {
      throw new BadRequestException({
        code: 'APPLICATION_ALREADY_REVIEWED',
        message: 'This application has already been reviewed',
      });
    }

    await this.brokerRepository.updateStatus(applicationId, {
      status: 'REJECTED',
      adminNote,
      reviewedBy: adminId,
      reviewedAt: new Date(),
    });

    await this.emailService.sendMail(
      application.email,
      'Your Nebula Broker Application Status',
      `<p>Thank you for your interest in becoming a broker on Nebula.</p>
       <p>After careful review, we are unable to approve your application at this time.</p>
       <p>Reason: ${adminNote}</p>`,
    );

    return { message: 'Application rejected.' };
  }
}