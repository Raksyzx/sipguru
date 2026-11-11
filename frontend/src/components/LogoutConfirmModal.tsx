import { LogOut } from "lucide-react";

interface LogoutConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LogoutConfirmModal({ open, onConfirm, onCancel }: LogoutConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300 modal-fixed-overlay">
      <div className="glass-card-light w-full max-w-md p-6 rounded-2xl animate-in zoom-in-95 duration-300 border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.15)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center ring-2 ring-red-500/30 shadow-lg">
              <LogOut className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Logout</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Konfirmasi keluar dari akun</p>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 mb-6">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            Apakah Anda yakin ingin keluar dari akun?
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Anda perlu login kembali untuk mengakses dashboard.
          </p>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 hover:shadow-md"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-red-500/25 flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Ya, Logout
          </button>
        </div>
      </div>
    </div>
  );
}
