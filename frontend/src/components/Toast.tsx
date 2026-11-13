import { useState } from "react";
import { CheckCircle, XCircle, AlertCircle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: ToastType, message: string, duration = 3000) => {
    const id = Math.random().toString(36).substr(2, 9);
    const toast: ToastMessage = { id, type, message };
    
    setToasts(prev => [...prev, toast]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const success = (message: string) => addToast("success", message);
  const error = (message: string) => addToast("error", message);
  const info = (message: string) => addToast("info", message);

  return { toasts, addToast, removeToast, success, error, info };
}

export function ToastContainer({ toasts, remove }: { toasts: ToastMessage[]; remove: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg backdrop-blur-sm animate-slide-in-right max-w-sm ${
            toast.type === "success"
              ? "bg-emerald-50/95 dark:bg-emerald-950/95 border border-emerald-200 dark:border-emerald-800"
              : toast.type === "error"
              ? "bg-red-50/95 dark:bg-red-950/95 border border-red-200 dark:border-red-800"
              : "bg-blue-50/95 dark:bg-blue-950/95 border border-blue-200 dark:border-blue-800"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          ) : toast.type === "error" ? (
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          )}
          <p className={`text-sm font-medium ${
            toast.type === "success"
              ? "text-emerald-800 dark:text-emerald-200"
              : toast.type === "error"
              ? "text-red-800 dark:text-red-200"
              : "text-blue-800 dark:text-blue-200"
          }`}>
            {toast.message}
          </p>
          <button
            onClick={() => remove(toast.id)}
            className="ml-auto p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
