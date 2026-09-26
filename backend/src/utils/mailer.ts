import nodemailer from "nodemailer";

function getTransporter() {
  const user = process.env.SMTP_USER || "karnikap376@gmail.com";
  const pass = process.env.SMTP_PASS || "emzswvazajwkeoqi";

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

export interface EmailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}) {
  if (process.env.NODE_ENV === "test") return; // skip in tests
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM ?? `SkillBridge AI <${process.env.SMTP_USER || "karnikap376@gmail.com"}>`,
      ...opts,
    });
    console.log(`[EMAIL DISPATCHED] To: ${opts.to} | Subject: ${opts.subject} | Response: ${info.response}`);
    return info;
  } catch (err) {
    console.error("[EMAIL ERROR]", (err as Error)?.message || err);
  }
}
