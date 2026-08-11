/**
 * OTP Authentication Service
 *
 * Handles phone-based OTP authentication via WhatsApp and SMS through Supabase Auth.
 */

import { supabaseAuthAdapter } from './supabase-auth';
import { authService } from './auth';
import logger from '../utils/logger';

export type OTPChannel = 'whatsapp' | 'sms';
export type OTPPurpose = 'registration' | 'login' | 'verification';

export interface SendOTPRequest {
  phoneNumber: string;
  channel?: OTPChannel;
  purpose: OTPPurpose;
}

export interface SendOTPResponse {
  success: boolean;
  message: string;
  channel: OTPChannel;
  expiresAt?: string;
  retryAfter?: number;
}

export interface VerifyOTPRequest {
  phoneNumber: string;
  code: string;
  tempToken?: string;
  deviceInfo?: {
    deviceId: string;
    platform: 'ios' | 'android' | 'web';
    model?: string;
    osVersion?: string;
  };
}

export interface VerifyOTPResponse {
  success: boolean;
  status: 'authenticated' | 'registration_required' | 'phone_verified';
  accessToken?: string;
  refreshToken?: string;
  biometricEnrollmentToken?: string;
  user?: {
    id: string;
    email?: string;
    fullName?: string;
    phoneVerified: boolean;
  };
  message?: string;
}

class OTPAuthService {
  /**
   * Send OTP code to phone number
   * Priority: WhatsApp → SMS
   */
  async sendOTP(request: SendOTPRequest): Promise<SendOTPResponse> {
    try {
      logger.info('Sending OTP', {
        phone: this.maskPhone(request.phoneNumber),
        channel: request.channel || 'whatsapp',
        purpose: request.purpose,
      });

      await supabaseAuthAdapter.sendPhoneOtp(request.phoneNumber, request.channel || 'whatsapp');

      return {
        success: true,
        message: 'OTP sent successfully',
        channel: request.channel || 'whatsapp',
      };
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { retry_after?: number } }; message?: string };
      logger.error('Send OTP failed', error);

      if (err.response?.status === 429) {
        return {
          success: false,
          message: 'Too many attempts. Please wait before trying again.',
          channel: request.channel || 'whatsapp',
          retryAfter: err.response.data?.retry_after || 60,
        };
      }

      return {
        success: false,
        message: err.message || 'Failed to send OTP',
        channel: request.channel || 'whatsapp',
      };
    }
  }

  /**
   * Verify OTP code and authenticate/register user
   */
  async verifyOTP(request: VerifyOTPRequest): Promise<VerifyOTPResponse> {
    try {
      logger.info('Verifying OTP', {
        phone: this.maskPhone(request.phoneNumber),
      });

      void request.tempToken;
      void request.deviceInfo;

      const data = await supabaseAuthAdapter.verifyPhoneOtp(request.phoneNumber, request.code);

      if (data.access_token) {
        await authService.storeAuthData(data);
        if (data.profileComplete) {
          authService.notifyAuthStateChange(true);
        }
      }

      return {
        success: true,
        status: data.profileComplete ? 'authenticated' : 'registration_required',
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        biometricEnrollmentToken: data.user?.id,
        user: data.user ? {
          id: data.user.id,
          email: data.user.email,
          fullName: data.user.full_name,
          phoneVerified: true,
        } : undefined,
      };
    } catch (error: unknown) {
      const err = error as { response?: { status?: number }; message?: string };
      logger.error('Verify OTP failed', error);

      if (err.response?.status === 401) {
        return {
          success: false,
          status: 'authenticated',
          message: 'Invalid or expired code. Please try again.',
        };
      }

      if (err.response?.status === 429) {
        return {
          success: false,
          status: 'authenticated',
          message: 'Too many failed attempts. Please request a new code.',
        };
      }

      return {
        success: false,
        status: 'authenticated',
        message: err.message || 'Verification failed',
      };
    }
  }

  /**
   * Complete registration after phone verification
   */
  async completeRegistration(data: {
    tempToken: string;
    fullName: string;
    email?: string;
    birthDate?: string;
    acceptedTermsVersion?: string;
    acceptedPrivacyVersion?: string;
    marketingConsent?: boolean;
  }): Promise<VerifyOTPResponse> {
    try {
      logger.info('Completing registration');

      void data.tempToken;

      const profile = await supabaseAuthAdapter.updateProfile({
        full_name: data.fullName,
        email: data.email,
        birth_date: data.birthDate,
        accepted_terms_version: data.acceptedTermsVersion,
        accepted_privacy_version: data.acceptedPrivacyVersion,
        marketing_consent: data.marketingConsent,
      });

      await authService.storeAuthData({ user: profile });
      authService.notifyAuthStateChange(true);

      return {
        success: true,
        status: 'authenticated',
        biometricEnrollmentToken: profile.id,
        user: profile ? {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          phoneVerified: true,
        } : undefined,
      };
    } catch (error: unknown) {
      const err = error as { message?: string };
      logger.error('Complete registration failed', error);
      return {
        success: false,
        status: 'registration_required',
        message: err.message || 'Registration failed',
      };
    }
  }

  /**
   * Mask phone number for logging (privacy)
   */
  private maskPhone(phone: string): string {
    if (phone.length < 6) return '***';
    return phone.slice(0, 4) + '****' + phone.slice(-2);
  }
}

export const otpAuthService = new OTPAuthService();
export default otpAuthService;
