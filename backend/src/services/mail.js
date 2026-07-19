import nodemailer from 'nodemailer';

function transporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export async function sendMail({ to, subject, html, text, attachments }) {
  const tx = transporter();
  if (!tx) {
    if (process.env.NODE_ENV !== 'production') console.log(`[DEV MAIL] ${to} | ${subject}\n${text || html}`);
    return { delivered: false, development: true };
  }
  await tx.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html, text, attachments });
  return { delivered: true };
}

export const verificationTemplate = (name, url) => ({
  subject: 'Verify your HMN Agri Trade account',
  text: `Hello ${name}, verify your account: ${url}`,
  html: `<div style="font-family:Arial;max-width:600px;margin:auto"><h2>Verify your HMN Agri Trade account</h2><p>Hello ${name},</p><p>Click the button below to verify your email.</p><p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#15803d;color:white;text-decoration:none;border-radius:8px">Verify email</a></p><p>This link expires in 24 hours.</p></div>`,
});
export const otpTemplate = (name, otp) => ({
  subject: 'Your HMN login OTP',
  text: `Hello ${name}, your OTP is ${otp}. It expires in 10 minutes.`,
  html: `<div style="font-family:Arial"><h2>HMN Agri Trade login code</h2><p>Hello ${name},</p><div style="font-size:34px;font-weight:800;letter-spacing:8px">${otp}</div><p>Expires in 10 minutes.</p></div>`,
});
export const resetTemplate = (name, url) => ({
  subject: 'Reset your HMN password',
  text: `Hello ${name}, reset your password: ${url}`,
  html: `<div style="font-family:Arial"><h2>Password reset</h2><p>Hello ${name},</p><p><a href="${url}">Reset password</a></p><p>This link expires in 20 minutes.</p></div>`,
});
