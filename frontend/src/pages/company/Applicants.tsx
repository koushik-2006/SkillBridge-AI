import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useToast, extractErrorMessage } from "../../lib/toast";
import DashboardLayout from "../../components/layout/DashboardLayout";
import { Badge, Button, Card, EmptyState, FullPageSpinner, Input, Label, PageHeader, Select, Textarea } from "../../components/ui";
import { Mail, Paperclip, Send, X } from "lucide-react";

interface RankedCandidate {
  applicationId: string;
  studentId: string;
  studentName: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
}

const STATUS_OPTIONS = ["APPLIED", "SHORTLISTED", "INTERVIEW_SCHEDULED", "INTERVIEWED", "OFFERED", "REJECTED", "HIRED"];

export default function CompanyApplicants() {
  const { id } = useParams();
  const [candidates, setCandidates] = useState<RankedCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Modal state for updating status with email & attachments
  const [selectedCandidate, setSelectedCandidate] = useState<RankedCandidate | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>("SHORTLISTED");
  const [noteMessage, setNoteMessage] = useState<string>("");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [submittingStatus, setSubmittingStatus] = useState<boolean>(false);

  const { push } = useToast();

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/ai/opportunities/${id}/rank-candidates`);
      setCandidates(data.data);
    } catch (err) {
      push(extractErrorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  function openStatusModal(candidate: RankedCandidate, initialStatus?: string) {
    setSelectedCandidate(candidate);
    setTargetStatus(initialStatus || "SHORTLISTED");
    setNoteMessage("");
    setAttachmentFile(null);
  }

  async function handleStatusSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedCandidate) return;

    setSubmittingStatus(true);
    try {
      const form = new FormData();
      form.append("status", targetStatus);
      if (noteMessage.trim()) {
        form.append("note", noteMessage.trim());
      }
      if (attachmentFile) {
        form.append("attachment", attachmentFile);
      }

      await api.patch(`/companies/applications/${selectedCandidate.applicationId}/status`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      push(
        attachmentFile
          ? `Status updated to ${targetStatus} and email with attachment sent to student!`
          : `Status updated to ${targetStatus} and email notification sent to student!`,
        "success"
      );
      setSelectedCandidate(null);
      setAttachmentFile(null);
      setNoteMessage("");
    } catch (err) {
      push(extractErrorMessage(err), "error");
    } finally {
      setSubmittingStatus(false);
    }
  }

  if (loading) return <DashboardLayout><FullPageSpinner /></DashboardLayout>;

  return (
    <DashboardLayout>
      <PageHeader title="Applicant Ranking" subtitle="AI-ranked candidates for this posting, best match first." />
      {candidates.length === 0 ? (
        <EmptyState title="No applicants yet" description="Check back once students start applying." />
      ) : (
        <div className="space-y-3">
          {candidates.map((c, i) => (
            <Card key={c.applicationId} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
                    #{i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-ink">{c.studentName}</p>
                    <p className="text-xs text-ink-faint">Match score {c.score}%</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => openStatusModal(c)}
                    className="flex items-center gap-1.5"
                  >
                    <Mail size={14} />
                    Update Status & Notify
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {c.matchedSkills.map((s) => <Badge key={s} tone="green">{s}</Badge>)}
                {c.missingSkills.map((s) => <Badge key={s} tone="amber">missing: {s}</Badge>)}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Status Update & Email Modal */}
      {selectedCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-stroke p-6">
            <div className="flex items-center justify-between border-b border-stroke pb-3 mb-4">
              <div>
                <h3 className="font-display font-semibold text-lg text-ink">Update Status & Email Candidate</h3>
                <p className="text-xs text-ink-muted">Candidate: <strong>{selectedCandidate.studentName}</strong></p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCandidate(null)}
                className="text-ink-muted hover:text-danger p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStatusSubmit} className="space-y-4">
              <div>
                <Label>New Application Status</Label>
                <Select value={targetStatus} onChange={(e) => setTargetStatus(e.target.value)}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </Select>
              </div>

              <div>
                <Label>Custom Message / Note for Student (Optional)</Label>
                <Textarea
                  rows={3}
                  value={noteMessage}
                  onChange={(e) => setNoteMessage(e.target.value)}
                  placeholder={
                    targetStatus === "HIRED" || targetStatus === "OFFERED"
                      ? "Congratulations! We are pleased to extend this offer. Please find your offer letter attached."
                      : "We were impressed by your background and would like to invite you for the next round..."
                  }
                />
              </div>

              <div>
                <Label className="flex items-center gap-1.5">
                  <Paperclip size={14} />
                  Attach Document / Offer Letter (Optional PDF/DOC)
                </Label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg"
                  onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
                  className="block w-full text-xs text-ink-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                />
                {attachmentFile && (
                  <p className="mt-1 text-xs text-growth flex items-center gap-1">
                    ✓ Attached: {attachmentFile.name} ({(attachmentFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>

              <div className="rounded-xl bg-accent-50 dark:bg-slate-800/60 p-3 text-xs text-ink-muted flex items-start gap-2">
                <Mail size={16} className="text-brand-600 shrink-0 mt-0.5" />
                <span>
                  When you submit, SkillBridge will automatically send an official email notification to <strong>{selectedCandidate.studentName}</strong> with the status update{attachmentFile ? " and your attached document/offer letter" : ""}.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stroke">
                <Button type="button" variant="secondary" onClick={() => setSelectedCandidate(null)}>
                  Cancel
                </Button>
                <Button type="submit" loading={submittingStatus} className="flex items-center gap-1.5">
                  <Send size={14} />
                  Send & Update Status
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
