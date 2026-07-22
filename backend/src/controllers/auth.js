import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { User, Session, AuditLog } from '../models/index.js';
import { sendMail, verificationTemplate, otpTemplate, resetTemplate } from '../services/mail.js';
import { env } from '../config/env.js';

authenticator.options = { window: 1 };

const normalizeAuthenticatorCode = (value) => String(value || '').replace(/\D/g, '').slice(0, 6);
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const accessToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, env.jwtSecret, {
    expiresIn: '15m',
    issuer: env.jwtIssuer,
    audience: env.jwtAudience,
    algorithm: 'HS256',
    jwtid: crypto.randomUUID(),
  });
const refreshToken = () => crypto.randomBytes(48).toString('hex');
const safeUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  customRole: u.customRole ? { id: u.customRole._id, name: u.customRole.name } : null,
  permissions: [...(u.customRole?.permissions || []), ...(u.permissions || [])],
  emailVerified: u.emailVerified,
  twoFactorEnabled: u.twoFactorEnabled,
});
const cookieOptions = (rememberMe = false) => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: env.isProduction,
  maxAge: (rememberMe ? 30 : 7) * 86400000,
  path: '/api/auth',
  priority: 'high',
});
const clientUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';
async function audit(req, user, action, description, metadata) {
  await AuditLog.create({
    user: user?._id,
    action,
    entity: 'User',
    entityId: user?._id,
    description,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    metadata,
  });
}
async function issueSession(req, res, user, rememberMe = false) {
  const refresh = refreshToken();
  await Session.create({
    user: user._id,
    tokenHash: sha(refresh),
    userAgent: req.get('user-agent'),
    ip: req.ip,
    rememberMe,
    expiresAt: new Date(Date.now() + (rememberMe ? 30 : 7) * 86400000),
  });
  res.cookie('hmn_refresh', refresh, cookieOptions(rememberMe));
  return { token: accessToken(user), user: safeUser(user) };
}
async function issueVerification(user) {
  const token = crypto.randomBytes(32).toString('hex');
  user.emailVerificationToken = sha(token);
  user.emailVerificationExpires = new Date(Date.now() + 24 * 3600000);
  await user.save();
  const url = `${clientUrl()}/admin/verify-email?token=${token}`;
  const tpl = verificationTemplate(user.name, url);
  const delivery = await sendMail({ to: user.email, ...tpl });
  return { token, url, delivery };
}

export async function login(req, res) {
  const { email, password, rememberMe = false, twoFactorCode, recoveryCode, trustDevice = false } = req.body;
  const user = await User.findOne({ email: String(email || '').toLowerCase() }).populate('customRole');
  if (!user || !user.active) {
    await audit(req, null, 'LOGIN_FAILED', 'Unknown or inactive account', { email: String(email || '').toLowerCase() });
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  if (user.lockedUntil && user.lockedUntil > Date.now())
    return res.status(423).json({ message: 'Account temporarily locked. Try again later.' });
  if (!(await bcrypt.compare(password || '', user.password))) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    await audit(req, user, 'LOGIN_FAILED', 'Invalid password');
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.emailVerified) {
    return res.status(403).json({ code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before signing in.' });
  }
  if (user.twoFactorEnabled) {
    let valid = false;
    if (twoFactorCode) valid = authenticator.check(normalizeAuthenticatorCode(twoFactorCode), user.twoFactorSecret);
    if (!valid && recoveryCode) {
      const h = sha(String(recoveryCode).toUpperCase());
      const i = (user.recoveryCodeHashes || []).indexOf(h);
      if (i >= 0) {
        user.recoveryCodeHashes.splice(i, 1);
        valid = true;
      }
    }
    if (!valid)
      return res
        .status(428)
        .json({ code: 'TWO_FACTOR_REQUIRED', message: 'Enter your authenticator code or recovery code.' });
    if (trustDevice) {
      const raw = crypto.randomBytes(32).toString('hex');
      user.trustedDevices.push({
        tokenHash: sha(raw),
        label: req.get('user-agent')?.slice(0, 120),
        expiresAt: new Date(Date.now() + 30 * 86400000),
        lastUsedAt: new Date(),
      });
      res.cookie('hmn_trusted_device', raw, {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.isProduction,
        maxAge: 30 * 86400000,
        path: '/api/auth',
      });
    }
  }
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  await audit(req, user, 'LOGIN', 'Successful login');
  res.json(await issueSession(req, res, user, Boolean(rememberMe)));
}
export async function refresh(req, res) {
  const raw = req.cookies?.hmn_refresh;
  if (!raw) return res.status(401).json({ message: 'Refresh session missing' });
  const now = new Date();
  const session = await Session.findOneAndUpdate(
    { tokenHash: sha(raw), revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now, revokeReason: 'rotated' } },
    { new: false },
  ).populate({ path: 'user', populate: { path: 'customRole' } });
  if (!session || !session.user?.active) return res.status(401).json({ message: 'Session expired' });
  const payload = await issueSession(req, res, session.user, Boolean(session.rememberMe));
  await audit(req, session.user, 'TOKEN_REFRESH', 'Refresh token rotated', { sessionId: session._id });
  res.json(payload);
}
export async function me(req, res) {
  res.json({ user: safeUser(req.user) });
}
export async function logout(req, res) {
  const raw = req.cookies?.hmn_refresh;
  if (raw) await Session.findOneAndUpdate({ tokenHash: sha(raw) }, { revokedAt: new Date() });
  await audit(req, req.user, 'LOGOUT', 'User logged out');
  res.clearCookie('hmn_refresh', { path: '/api/auth' });
  res.clearCookie('hmn_trusted_device', { path: '/api/auth' });
  res.json({ success: true });
}
export async function sendVerification(req, res) {
  const user = await User.findOne({ email: String(req.body.email || req.user?.email || '').toLowerCase() });
  if (!user) return res.json({ message: 'If the account exists, verification instructions were sent.' });
  if (user.emailVerified) return res.json({ message: 'Email already verified.' });
  const x = await issueVerification(user);
  res.json({
    message: 'Verification instructions sent.',
    ...(process.env.NODE_ENV !== 'production' ? { developmentVerificationUrl: x.url } : {}),
  });
}
export async function verifyEmail(req, res) {
  const user = await User.findOne({
    emailVerificationToken: sha(req.body.token || ''),
    emailVerificationExpires: { $gt: new Date() },
  });
  if (!user) return res.status(400).json({ message: 'Invalid or expired verification token' });
  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();
  await audit(req, user, 'EMAIL_VERIFIED', 'Email address verified');
  res.json({ message: 'Email verified successfully' });
}
export async function forgotPassword(req, res) {
  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (!user) return res.json({ message: 'If the account exists, reset instructions were sent.' });
  const token = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = sha(token);
  user.passwordResetExpires = new Date(Date.now() + 20 * 60000);
  await user.save();
  const url = `${clientUrl()}/admin/reset-password?token=${token}`;
  await sendMail({ to: user.email, ...resetTemplate(user.name, url) });
  res.json({
    message: 'Password reset instructions sent.',
    ...(process.env.NODE_ENV !== 'production' ? { developmentResetUrl: url } : {}),
  });
}
export async function resetPassword(req, res) {
  const user = await User.findOne({
    passwordResetToken: sha(req.body.token || ''),
    passwordResetExpires: { $gt: new Date() },
  });
  if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });
  if (String(req.body.password || '').length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  user.password = await bcrypt.hash(req.body.password, 12);
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  await Session.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  await audit(req, user, 'PASSWORD_RESET', 'Password reset completed');
  res.json({ message: 'Password changed successfully' });
}
export async function requestOtp(req, res) {
  const user = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (!user) return res.json({ message: 'If the account exists, an OTP was sent.' });
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  user.otpHash = sha(otp);
  user.otpExpires = new Date(Date.now() + 10 * 60000);
  await user.save();
  await sendMail({ to: user.email, ...otpTemplate(user.name, otp) });
  res.json({ message: 'OTP sent.', ...(process.env.NODE_ENV !== 'production' ? { developmentOtp: otp } : {}) });
}
export async function verifyOtp(req, res) {
  const user = await User.findOne({
    email: String(req.body.email || '').toLowerCase(),
    otpHash: sha(req.body.otp || ''),
    otpExpires: { $gt: new Date() },
  }).populate('customRole');
  if (!user) return res.status(400).json({ message: 'Invalid or expired OTP' });
  user.otpHash = undefined;
  user.otpExpires = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  await audit(req, user, 'OTP_LOGIN', 'Signed in using OTP');
  res.json(await issueSession(req, res, user, Boolean(req.body.rememberMe)));
}
export async function setupTwoFactor(req, res) {
  const secret = authenticator.generateSecret();
  req.user.twoFactorSecret = secret;
  await req.user.save();
  const otpauth = authenticator.keyuri(req.user.email, 'HMN Agri Trade', secret);
  const qrCode = await QRCode.toDataURL(otpauth);
  res.json({ secret, qrCode, otpauth });
}
export async function enableTwoFactor(req, res) {
  if (
    !req.user.twoFactorSecret ||
    !authenticator.check(normalizeAuthenticatorCode(req.body.code), req.user.twoFactorSecret)
  )
    return res.status(400).json({ message: 'Invalid authenticator code' });
  const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase());
  req.user.twoFactorEnabled = true;
  req.user.recoveryCodeHashes = codes.map(sha);
  await req.user.save();
  await audit(req, req.user, '2FA_ENABLED', 'Two-factor authentication enabled');
  res.json({ message: '2FA enabled', recoveryCodes: codes });
}
export async function disableTwoFactor(req, res) {
  if (!authenticator.check(normalizeAuthenticatorCode(req.body.code), req.user.twoFactorSecret || ''))
    return res.status(400).json({ message: 'Invalid authenticator code' });
  req.user.twoFactorEnabled = false;
  req.user.twoFactorSecret = undefined;
  req.user.recoveryCodeHashes = [];
  req.user.trustedDevices = [];
  await req.user.save();
  await audit(req, req.user, '2FA_DISABLED', 'Two-factor authentication disabled');
  res.json({ message: '2FA disabled' });
}
export async function sessions(req, res) {
  const items = await Session.find({ user: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({
    createdAt: -1,
  });
  res.json(items);
}
export async function revokeSession(req, res) {
  await Session.updateOne({ _id: req.params.id, user: req.user._id }, { revokedAt: new Date() });
  await audit(req, req.user, 'SESSION_REVOKED', 'User revoked an active session', { sessionId: req.params.id });
  res.json({ success: true });
}
