import { Resend } from 'resend';
import crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@example.com';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || process.env.EMAIL_FROM || 'noreply@example.com';

/**
 * Generate a cryptographically secure 6-digit verification code
 */
export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generate a cryptographically secure reset token (64 hex characters)
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Send email verification code to user
 */
export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Verify your email address',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Verify your email address</h2>
          <p>Please enter the following code to verify your email address:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px;">
            <h1 style="font-size: 32px; letter-spacing: 8px; color: #333; margin: 0;">${code}</h1>
          </div>
          <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
          <p style="color: #666; font-size: 14px;">If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `,
      text: `Verify your email address\n\nYour verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you didn't create an account, you can safely ignore this email.`,
    });
    return true;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return false;
  }
}

/**
 * Send password reset link to user
 */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<boolean> {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Reset your password',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Reset your password</h2>
          <p>Click the button below to reset your password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
          </div>
          <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
          <p style="color: #666; font-size: 12px; word-break: break-all;">${resetUrl}</p>
          <p style="color: #666; font-size: 14px;">This link will expire in 1 hour.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      `,
      text: `Reset your password\n\nClick this link to reset your password: ${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request a password reset, you can safely ignore this email.`,
    });
    return true;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    return false;
  }
}

/**
 * Send password changed confirmation email
 */
export async function sendPasswordChangedEmail(email: string): Promise<boolean> {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Your password has been changed',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password changed successfully</h2>
          <p>Your password has been successfully changed.</p>
          <p style="color: #666; font-size: 14px;">If you didn't make this change, please contact support immediately.</p>
        </div>
      `,
      text: `Password changed successfully\n\nYour password has been successfully changed.\n\nIf you didn't make this change, please contact support immediately.`,
    });
    return true;
  } catch (error) {
    console.error('Failed to send password changed email:', error);
    return false;
  }
}

/**
 * Send contact form submission email
 */
export async function sendContactEmail(
  userEmail: string,
  subject: string,
  message: string,
  userIP: string,
  referenceId: string
): Promise<boolean> {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: CONTACT_EMAIL,
      replyTo: userEmail,
      subject: `Contact Form: ${subject} [${referenceId}]`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Contact Form Submission</h2>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Reference ID:</strong> <code style="background-color: #e0e0e0; padding: 2px 6px; border-radius: 4px; font-family: monospace;">${referenceId}</code></p>
            <p style="margin: 0 0 10px 0;"><strong>From:</strong> ${userEmail}</p>
            <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${subject}</p>
            <p style="margin: 0 0 10px 0;"><strong>IP Address:</strong> ${userIP}</p>
            <p style="margin: 0;"><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <div style="background-color: #ffffff; padding: 20px; border-left: 4px solid #007bff; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Message:</h3>
            <p style="color: #666; white-space: pre-wrap; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</p>
          </div>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            You can reply directly to this email to respond to ${userEmail}.
          </p>
        </div>
      `,
      text: `New Contact Form Submission\n\nReference ID: ${referenceId}\nFrom: ${userEmail}\nSubject: ${subject}\nIP Address: ${userIP}\nSubmitted: ${new Date().toLocaleString()}\n\nMessage:\n${message}`,
    });
    return true;
  } catch (error) {
    console.error('Failed to send contact email:', error);
    return false;
  }
}
