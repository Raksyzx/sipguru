import { useEffect, useRef, useState } from "react";
import { CalendarX, ChevronRight, Loader2, X } from "lucide-react";
import { createPortal } from "react-dom";

interface LeaveData {
  start_date: string;
  end_date: string;
  reason: string;
  schedule_id: string | null;
}

interface LeaveSectionProps {
  schedulesList: { id: string; grade_name: string; subject_name: string }[];
  hasPending: boolean;
  onSubmit: (data: LeaveData) => Promise<{ success: boolean; error?: string }>;
}

const emptyForm = { start_date: "", end_date: "", reason: "", schedule_id: "" };
const fieldClass = "block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none transition-shadow focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-gray-700 dark:bg-stone-800 dark:text-white sm:text-sm";
const labelClass = "mb-1.5 block text-xs font-medium text-gray-600 dark:text-gray-400";

export const LeaveSection = ({ schedulesList, hasPending, onSubmit }: LeaveSectionProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const submittingRef = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  const close = () => {
    if (!submittingRef.current) setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || hasPending) return;
    if (!formData.start_date || !formData.end_date || !formData.reason.trim()) {
      setError("Lengkapi tanggal dan alasan izin.");
      return;
    }
    if (formData.end_date < formData.start_date) {
      setError("Tanggal selesai tidak boleh sebelum tanggal mulai.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const result = await onSubmit({
        ...formData,
        reason: formData.reason.trim(),
        schedule_id: formData.schedule_id || null,
      });
      if (result.success) {
        setFormData(emptyForm);
        setSuccess("Izin berhasil diajukan. Menunggu persetujuan admin.");
        setIsOpen(false);
      } else {
        setError(result.error || "Gagal mengajukan izin. Silakan coba lagi.");
      }
    } catch {
      setError("Gagal mengajukan izin. Silakan coba lagi.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <div>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-controls="leave-dialog"
          aria-expanded={isOpen}
          aria-disabled={hasPending}
          onClick={() => {
            if (hasPending) return;
            setError("");
            setSuccess("");
            setIsOpen(true);
          }}
          className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-3 text-left text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:bg-gray-200 aria-disabled:text-gray-500 dark:focus-visible:ring-offset-stone-950 dark:aria-disabled:bg-stone-800 dark:aria-disabled:text-gray-400 sm:px-5"
        >
          <CalendarX aria-hidden="true" className="h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1">{hasPending ? "Izin sedang diproses" : "Ajukan Izin"}</span>
          <ChevronRight aria-hidden="true" className="h-5 w-5 shrink-0" />
        </button>
        <p role="status" className="text-xs text-emerald-700 empty:hidden dark:text-emerald-400 [&:not(:empty)]:mt-2">{success}</p>
      </div>

      {createPortal(
        <dialog
          ref={dialogRef}
          id="leave-dialog"
          aria-labelledby="leave-dialog-title"
          aria-describedby="leave-dialog-description"
          aria-modal="true"
          onCancel={(e) => { e.preventDefault(); close(); }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            const rect = e.currentTarget.getBoundingClientRect();
            if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close();
          }}
          className="m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm dark:border-stone-700 dark:bg-stone-900 dark:text-white"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900 sm:px-5">
            <h2 id="leave-dialog-title" className="text-lg font-semibold">Ajukan Izin</h2>
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              aria-label="Tutup pengajuan izin"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-stone-800"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} aria-busy={submitting} className="space-y-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-5">
            <p id="leave-dialog-description" className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">Isi tanggal dan alasan izin. Jadwal mapel boleh dikosongkan.</p>
            <fieldset disabled={submitting} className="min-w-0 space-y-4">
              <legend className="sr-only">Detail pengajuan izin</legend>
              <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor="leave-start-date" className={labelClass}>Tanggal Mulai</label>
                  <input id="leave-start-date" name="start_date" type="date" required value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className={fieldClass} />
                </div>
                <div className="min-w-0">
                  <label htmlFor="leave-end-date" className={labelClass}>Tanggal Selesai</label>
                  <input id="leave-end-date" name="end_date" type="date" required min={formData.start_date || undefined} value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className={fieldClass} />
                </div>
              </div>
              <div className="min-w-0">
                <label htmlFor="leave-schedule" className={labelClass}>Jadwal Mapel (opsional)</label>
                <select id="leave-schedule" name="schedule_id" value={formData.schedule_id} onChange={(e) => setFormData({ ...formData, schedule_id: e.target.value })} className={fieldClass}>
                  <option value="">Pilih jadwal mapel</option>
                  {schedulesList.map((s) => <option key={s.id} value={s.id}>{s.grade_name} - {s.subject_name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="leave-reason" className={labelClass}>Alasan</label>
                <textarea id="leave-reason" name="reason" required rows={3} value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} className={`${fieldClass} resize-y`} placeholder="Isi alasan izin..." />
              </div>
            </fieldset>
            {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 pt-1">
              <button type="button" onClick={close} disabled={submitting} className="min-h-11 rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50 dark:bg-stone-800 dark:text-gray-300 dark:hover:bg-stone-700">Batal</button>
              <button type="submit" disabled={submitting || hasPending} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-stone-900">
                {submitting && <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />}
                {submitting ? "Mengirim..." : "Kirim Permohonan"}
              </button>
            </div>
          </form>
        </dialog>,
        document.body,
      )}
    </>
  );
};
