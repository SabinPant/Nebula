/**
 * Admin Controller
 *
 * HTTP route handlers for the admin panel. Routes ONLY — no business
 * logic, no database calls. Business logic for each domain (broker
 * applications, users, top-ups, etc.) stays in that domain's own
 * service; this controller composes them under the /admin prefix.
 *
 * Class-level guards apply to every route here: JwtAuthGuard first
 * (authenticates, populates request.user), then AdminGuard (enforces
 * userType === ADMIN). No per-route @Roles()/@UseGuards() needed —
 * that's the point of guarding at the controller level.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { BrokerService } from '../broker/broker.service';
import { AdminService } from './admin.service';
import { LearningService } from '../learning/learning.service';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { AdminTopupDto } from './dto/admin-topup.dto';
import { ResolveFlagDto } from './dto/resolve-flag.dto';
import { ReassignBrokerDto } from './dto/reassign-broker.dto';
import { CreateLearningResourceDto } from './dto/create-learning-resource.dto';
import { UpdateLearningResourceDto } from './dto/update-learning-resource.dto';
import { BrokerApplicationStatus, FlagStatus, UserType } from '@prisma/client';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly brokerService: BrokerService,
    private readonly adminService: AdminService,
    private readonly learningService: LearningService,
  ) {}

  /**
   * Returns all broker applications, optionally filtered by status.
   * Not paginated — see broker.service.ts's getAllApplications for why.
   */
  @Get('broker-applications')
  async getBrokerApplications(@Query('status') status?: string) {
    const validStatus =
      status && (Object.values(BrokerApplicationStatus) as string[]).includes(status)
        ? (status as BrokerApplicationStatus)
        : undefined;

    return this.brokerService.getAllApplications(validStatus);
  }

  /**
   * Approves a broker application and sends a setup invitation.
   * Moved from BrokerController — see broker.service.ts for the
   * actual approval logic (invitation creation, email, notifications).
   * adminId comes from the authenticated JWT (request.user), never the
   * request body — same pattern as suspendUser/unsuspendUser below. The
   * body previously accepted a client-supplied adminId, which let any
   * caller attribute the approval to an arbitrary user id in AuditLog.
   */
  @Patch('broker-applications/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveApplication(
    @Param('id') id: string,
    @Body() body: { brokerNumber: string; adminNote?: string },
    @Req() request: Request,
  ) {
    const adminId = (request.user as { id: string }).id;
    return this.brokerService.approveApplication(
      id,
      adminId,
      body.brokerNumber,
      body.adminNote,
    );
  }

  /**
   * Rejects a broker application with a mandatory reason.
   * Moved from BrokerController — see broker.service.ts for the
   * actual rejection logic (notification, status update).
   * adminId comes from the authenticated JWT — see approveApplication's
   * comment above for why.
   */
  @Patch('broker-applications/:id/reject')
  @HttpCode(HttpStatus.OK)
  async rejectApplication(
    @Param('id') id: string,
    @Body() body: { adminNote: string },
    @Req() request: Request,
  ) {
    if (!body.adminNote || body.adminNote.trim().length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'A rejection reason is required',
      });
    }

    const adminId = (request.user as { id: string }).id;
    return this.brokerService.rejectApplication(id, adminId, body.adminNote);
  }

  /**
   * Returns a page-based paginated user list, optionally filtered by
   * userType and/or a search term matched against email/displayName.
   */
  @Get('users')
  async getUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('userType') userType?: string,
    @Query('search') search?: string,
  ) {
    const validUserType =
      userType && (Object.values(UserType) as string[]).includes(userType)
        ? (userType as UserType)
        : undefined;

    return this.adminService.getUsers(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      { userType: validUserType, search },
    );
  }

  /**
   * Suspends a user: cancels all pending orders (releasing reserved
   * balance/shares), invalidates every session, and logs the action.
   * See admin.service.ts for the full transactional flow.
   */
  @Patch('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendUser(
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
    @Req() request: Request,
  ) {
    const adminId = (request.user as { id: string }).id;
    return this.adminService.suspendUser(id, dto.reason, adminId);
  }

  /**
   * Unsuspends a user. Does not resurrect cancelled orders.
   */
  @Patch('users/:id/unsuspend')
  @HttpCode(HttpStatus.OK)
  async unsuspendUser(@Param('id') id: string, @Req() request: Request) {
    const adminId = (request.user as { id: string }).id;
    return this.adminService.unsuspendUser(id, adminId);
  }

  /**
   * Reassigns a trader to a different broker. See admin.service.ts's
   * reassignBroker for the verification flow (trader must be a TRADER,
   * new broker must be an active BROKER).
   */
  @Patch('users/:userId/reassign-broker')
  @HttpCode(HttpStatus.OK)
  async reassignBroker(
    @Param('userId') userId: string,
    @Body() dto: ReassignBrokerDto,
    @Req() request: Request,
  ) {
    const adminId = (request.user as { id: string }).id;
    return this.adminService.reassignBroker(userId, dto.brokerId, adminId);
  }

  /**
   * Returns a page-based paginated list of ALL top-ups across every
   * broker/trader, including admin overrides.
   */
  @Get('topups')
  async getTopUps(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getTopUps(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * Admin override top-up: credits any amount to any trader's wallet,
   * bypassing the weekly cap entirely. See admin.service.ts's
   * overrideTopUp for the full transactional flow.
   */
  @Post('topups')
  @HttpCode(HttpStatus.OK)
  async overrideTopUp(@Body() dto: AdminTopupDto, @Req() request: Request) {
    const adminId = (request.user as { id: string }).id;
    return this.adminService.overrideTopUp(dto, adminId);
  }

  /**
   * Returns a page-based paginated audit log across the entire system,
   * optionally filtered by action.
   */
  @Get('audit')
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
  ) {
    return this.adminService.getAuditLogs(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      action,
    );
  }

  /**
   * Returns a page-based paginated list of ALL suspicious flags across
   * every broker/trader, optionally filtered by status.
   */
  @Get('flags')
  async getFlags(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const validStatus =
      status && (Object.values(FlagStatus) as string[]).includes(status)
        ? (status as FlagStatus)
        : undefined;

    return this.adminService.getFlags(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      validStatus,
    );
  }

  /**
   * Resolves or dismisses an OPEN flag with a mandatory decision note.
   * adminId comes from the authenticated JWT — same pattern as
   * suspendUser/unsuspendUser and approveApplication/rejectApplication
   * above, never from the request body.
   */
  @Patch('flags/:id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveFlag(
    @Param('id') id: string,
    @Body() dto: ResolveFlagDto,
    @Req() request: Request,
  ) {
    const adminId = (request.user as { id: string }).id;
    return this.adminService.resolveFlag(id, adminId, dto);
  }

  /**
   * Returns a read-only system status snapshot (engine health, DB/Redis
   * connectivity). No start/stop controls — see admin.service.ts's
   * getEngineStatus docstring.
   */
  @Get('engine/status')
  async getEngineStatus() {
    return this.adminService.getEngineStatus();
  }

  /**
   * Returns a page-based paginated list of ALL learning resources,
   * including unpublished ones. LearningService already has this logic
   * from Sprint 12 (built for this exact wiring) — this controller only
   * delegates.
   */
  @Get('learning')
  async getLearningResources(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.learningService.getAllResources(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * Creates a new learning resource. Slug format validated in
   * LearningService.createResource.
   */
  @Post('learning')
  @HttpCode(HttpStatus.CREATED)
  async createLearningResource(@Body() dto: CreateLearningResourceDto) {
    return this.learningService.createResource(dto);
  }

  /**
   * Updates an existing learning resource. 404s via
   * LearningService.getResourceById's existence check inside updateResource.
   */
  @Patch('learning/:id')
  @HttpCode(HttpStatus.OK)
  async updateLearningResource(
    @Param('id') id: string,
    @Body() dto: UpdateLearningResourceDto,
  ) {
    return this.learningService.updateResource(id, dto);
  }

  /**
   * Deletes a learning resource. 404s via LearningService.deleteResource's
   * existence check before the delete.
   */
  @Delete('learning/:id')
  @HttpCode(HttpStatus.OK)
  async deleteLearningResource(@Param('id') id: string) {
    await this.learningService.deleteResource(id);
    return { message: 'Learning resource deleted successfully' };
  }
}
