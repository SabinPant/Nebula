/**
 * Google OAuth 2.0 Strategy
 *
 * Passport strategy for Google authentication.
 * Handles the Google OAuth consent flow:
 * - GET /auth/google initiates the redirect to Google
 * - GET /auth/google/callback handles the response from Google
 *
 * On successful authentication, Passport calls the validate() method
 * with the Google profile. The controller's callback route then passes
 * this profile to authService.googleLogin() which creates or finds the
 * user and issues JWT tokens.
 *
 * Configuration comes from ConfigService — never hardcoded.
 * session: false — JWT is stateless, no server-side session.
 */

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID') || '',
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET') || '',
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL') || '',
      scope: ['email', 'profile'],
    });
  }

  /**
   * Validates the Google profile and returns a normalized user object.
   * Called automatically by Passport after Google returns user data.
   *
   * The returned object is attached to req.user and passed to the
   * controller's callback route handler.
   */
  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { name, emails, photos } = profile;

    const user = {
      email: emails[0].value,
      displayName: name?.givenName
        ? `${name.givenName} ${name.familyName || ''}`.trim()
        : emails[0].value.split('@')[0],
      avatarUrl: photos?.[0]?.value || null,
    };

    done(null, user);
  }
}