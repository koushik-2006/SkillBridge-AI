import { Response, NextFunction } from "express";
import { AuthedRequest } from "../../middlewares/auth";
import { prisma } from "../../config/prisma";

async function getCompany(userId: string) {
  return prisma.company.findUniqueOrThrow({ where: { userId } });
}

export async function getProfile(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const company = await prisma.company.findUniqueOrThrow({ where: { userId: req.user!.userId } });
    res.json({ success: true, data: company });
  } catch (err) { next(err); }
}

export async function updateProfile(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const company = await getCompany(req.user!.userId);
    res.json({ success: true, data: await prisma.company.update({ where: { id: company.id }, data: req.body }) });
  } catch (err) { next(err); }
}

export async function listMyOpportunities(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const company = await getCompany(req.user!.userId);
    const data = await prisma.opportunity.findMany({
      where: { companyId: company.id },
      include: { requiredSkills: { include: { skill: true } }, _count: { select: { applications: true } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createOpportunity(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const company = await getCompany(req.user!.userId);
    const { skillIds, skillNames, deadline, ...rest } = req.body; // skillIds: [{ skillId, weight }] OR skillNames: string[]

    let skillCreates: { skillId: string; weight: number }[] = (skillIds ?? []).map((s: any) => ({
      skillId: s.skillId,
      weight: s.weight ?? 1,
    }));

    if (Array.isArray(skillNames) && skillNames.length > 0) {
      const resolved = await Promise.all(
        skillNames.map((name: string) =>
          prisma.skill.upsert({ where: { name }, update: {}, create: { name } })
        )
      );
      skillCreates = [...skillCreates, ...resolved.map((s) => ({ skillId: s.id, weight: 1 }))];
    }

    let parsedDeadline: Date | undefined = undefined;
    if (deadline) {
      const trimmed = String(deadline).trim();
      if (trimmed) {
        const d = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00.000Z`);
        if (!isNaN(d.getTime())) parsedDeadline = d;
      }
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        ...rest,
        ...(parsedDeadline ? { deadline: parsedDeadline } : {}),
        companyId: company.id,
        requiredSkills: { create: skillCreates },
      },
    });

    const { indexOpportunity } = await import("../ai/vectorStore.service");
    indexOpportunity(opportunity as any).catch(() => {}); // fire-and-forget vector indexing

    // Notify registered students via email about new job/internship posting
    try {
      const { sendEmail } = await import("../../utils/mailer");
      const studentUsers = await prisma.user.findMany({
        where: { role: "STUDENT", isActive: true },
        include: { student: true },
      });

      const appUrl = process.env.APP_URL || "https://skillbridge-ai-frontend-cd9l.onrender.com";
      const oppTitle = opportunity.title;
      const compName = company.name;
      const oppType = opportunity.type === "INTERNSHIP" ? "Internship" : "Job";

      console.log(`[JOB BROADCAST] Sending alert to ${studentUsers.length} students concurrently...`);
      await Promise.all(
        studentUsers.map(async (u) => {
          if (!u.email) return;
          try {
            await sendEmail({
              to: u.email,
              subject: `🚀 New ${oppType} Alert: ${oppTitle} at ${compName}`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
                  <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 16px; border-radius: 8px; text-align: center; color: white; margin-bottom: 20px;">
                    <h2 style="margin: 0; font-size: 20px;">SkillBridge AI — New Opportunity Alert</h2>
                  </div>
                  <p>Hello <strong>${u.student?.fullName || "Student"}</strong>,</p>
                  <p>A new <strong>${oppType}</strong> opening has just been posted by <strong>${compName}</strong> on SkillBridge AI!</p>
                  <div style="background: #f8fafc; border-left: 4px solid #4f46e5; padding: 16px; margin: 16px 0; border-radius: 4px;">
                    <h3 style="margin: 0 0 8px 0; color: #1e293b;">${oppTitle}</h3>
                    <p style="margin: 4px 0; font-size: 14px; color: #64748b;"><strong>Company:</strong> ${compName}</p>
                    <p style="margin: 4px 0; font-size: 14px; color: #64748b;"><strong>Type:</strong> ${oppType}</p>
                    ${opportunity.location ? `<p style="margin: 4px 0; font-size: 14px; color: #64748b;"><strong>Location:</strong> ${opportunity.location} ${opportunity.isRemote ? "(Remote)" : ""}</p>` : ""}
                    ${opportunity.stipendOrSalary ? `<p style="margin: 4px 0; font-size: 14px; color: #64748b;"><strong>Compensation:</strong> ${opportunity.stipendOrSalary}</p>` : ""}
                  </div>
                  <div style="text-align: center; margin-top: 24px;">
                    <a href="${appUrl}/student/opportunities" style="background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">View Opportunity & Apply</a>
                  </div>
                  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                  <p style="font-size: 12px; color: #94a3b8; text-align: center;">You received this email because you are registered as a student on SkillBridge AI.</p>
                </div>
              `,
            });
          } catch (e) {
            console.warn(`Failed sending to ${u.email}:`, e);
          }
        })
      );
    } catch (err) {
      console.warn("Error sending opportunity broadcast emails:", (err as Error)?.message || err);
    }

    res.status(201).json({ success: true, data: opportunity });
  } catch (err) { next(err); }
}

export async function updateOpportunity(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { deadline, ...rest } = req.body;
    const updateData: any = { ...rest };
    if (deadline !== undefined) {
      if (!deadline) {
        updateData.deadline = null;
      } else {
        const trimmed = String(deadline).trim();
        const d = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00.000Z`);
        updateData.deadline = isNaN(d.getTime()) ? null : d;
      }
    }
    const data = await prisma.opportunity.update({ where: { id: req.params.id }, data: updateData });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteOpportunity(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    await prisma.opportunity.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) { next(err); }
}

export async function listApplicants(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { rankCandidatesForOpportunity } = await import("../ai/matching.service");
    const ranked = await rankCandidatesForOpportunity(req.params.id);
    res.json({ success: true, data: ranked });
  } catch (err) { next(err); }
}

export async function updateApplicationStatus(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { status, note, message } = req.body;

    let attachmentUrl: string | undefined = undefined;
    if (req.file) {
      const { uploadBuffer } = await import("../../config/cloudinary");
      attachmentUrl = await uploadBuffer(req.file.buffer, "offer-letters", "raw");
    }

    const noteWithAttachment = [
      note || message,
      attachmentUrl ? `[ATTACHMENT:${req.file?.originalname || "Offer_Letter.pdf"}]:${attachmentUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const application = await prisma.application.update({
      where: { id: req.params.id },
      data: {
        status,
        statusHistory: {
          create: {
            status,
            note: noteWithAttachment || undefined,
          },
        },
      },
      include: {
        student: { include: { user: true } },
        opportunity: { include: { company: true } },
        statusHistory: true,
      },
    });

    // In-app notification
    await prisma.notification.create({
      data: {
        userId: application.student.userId,
        type: "APPLICATION_UPDATE",
        title: "Application status updated",
        body: `Your application for ${application.opportunity.title} at ${application.opportunity.company.name} changed to ${status}`,
        link: "/student/applications",
      },
    });

    // Email notification to student with status update and attached offer letter
    try {
      const { sendEmail } = await import("../../utils/mailer");
      const studentEmail = application.student.user.email;
      const studentName = application.student.fullName || "Student";
      const jobTitle = application.opportunity.title;
      const companyName = application.opportunity.company.name;
      const formattedStatus = status.replace(/_/g, " ");

      const attachments = req.file
        ? [
            {
              filename: req.file.originalname || `Offer_Letter_${jobTitle.replace(/\s+/g, "_")}.pdf`,
              content: req.file.buffer,
              contentType: req.file.mimetype || "application/pdf",
            },
          ]
        : undefined;

      let statusMessage = `Your application status for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been updated to <strong>${formattedStatus}</strong>.`;
      if (status === "HIRED") {
        statusMessage = `🎉 <strong>Congratulations!</strong> You have been <strong>HIRED</strong> for the position of <strong>${jobTitle}</strong> at <strong>${companyName}</strong>! ${req.file ? "Please find your official Offer Letter attached to this email and available for download on your student dashboard." : ""}`;
      } else if (status === "OFFERED") {
        statusMessage = `🎉 <strong>Congratulations!</strong> You have received a job offer for <strong>${jobTitle}</strong> at <strong>${companyName}</strong>! ${req.file ? "Please review the attached offer letter and download it from your student dashboard." : ""}`;
      } else if (status === "SHORTLISTED") {
        statusMessage = `✨ Great news! Your application for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been <strong>SHORTLISTED</strong> for further rounds.`;
      } else if (status === "INTERVIEW_SCHEDULED") {
        statusMessage = `📅 Your interview for <strong>${jobTitle}</strong> at <strong>${companyName}</strong> has been scheduled.`;
      }

      const emailNote = note || message;

      console.log(`[STATUS EMAIL] Sending status update to ${studentEmail}...`);
      await sendEmail({
        to: studentEmail,
        subject: `${status === "HIRED" || status === "OFFERED" ? "🎉 Offer Letter & Update" : "Application Update"}: ${jobTitle} at ${companyName} (${formattedStatus})`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
            <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); padding: 16px; border-radius: 8px; text-align: center; color: white; margin-bottom: 20px;">
              <h2 style="margin: 0; font-size: 20px;">SkillBridge AI — Application Status Update</h2>
            </div>
            <p>Dear <strong>${studentName}</strong>,</p>
            <p>${statusMessage}</p>
            ${emailNote ? `
              <div style="background: #f1f5f9; border-left: 4px solid #6366f1; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Note from ${companyName}:</strong></p>
                <p style="margin: 6px 0 0 0; font-size: 14px; color: #475569;">${emailNote}</p>
              </div>
            ` : ""}
            ${req.file ? `
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 12px 16px; margin: 16px 0; border-radius: 6px; color: #065f46;">
                📎 <strong>Offer Letter / Document Attached:</strong> ${req.file.originalname}
                <br />
                <span style="font-size: 12px; color: #047857;">You can open the attachment directly from this email or download it anytime from your SkillBridge student portal.</span>
              </div>
            ` : ""}
            <div style="text-align: center; margin-top: 24px;">
              <a href="${process.env.APP_URL || "https://skillbridge-ai-frontend-cd9l.onrender.com"}/student/applications" style="background: #4f46e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">View in Student Dashboard & Download</a>
            </div>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 12px; color: #94a3b8; text-align: center;">Best regards,<br /><strong>${companyName}</strong> via SkillBridge AI</p>
          </div>
        `,
        attachments,
      });
    } catch (err) {
      console.warn("Error sending student application status email:", (err as Error)?.message || err);
    }

    res.json({ success: true, data: application });
  } catch (err) { next(err); }
}

export async function listExpectations(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const company = await getCompany(req.user!.userId);
    res.json({ success: true, data: await prisma.industryExpectation.findMany({ where: { companyId: company.id } }) });
  } catch (err) { next(err); }
}
export async function createExpectation(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const company = await getCompany(req.user!.userId);
    res.status(201).json({ success: true, data: await prisma.industryExpectation.create({ data: { ...req.body, companyId: company.id } }) });
  } catch (err) { next(err); }
}
export async function updateExpectation(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await prisma.industryExpectation.update({ where: { id: req.params.id }, data: req.body }) });
  } catch (err) { next(err); }
}
export async function deleteExpectation(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    await prisma.industryExpectation.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
}
