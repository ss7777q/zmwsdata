
interface LoadingSpinnerProps {
  message?: string;
  subtitle?: string;
  fullscreen?: boolean;
}

export default function LoadingSpinner({
  message = "正在载入系统视图...",
  subtitle = "造梦无双全系统数值展示",
  fullscreen = false
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex w-full items-center justify-center transition-all duration-300 ${fullscreen ? 'fixed inset-0 z-50 bg-background/80 backdrop-blur-md' : 'min-h-[360px] py-16'}`}
    >
      <div className="flex w-[min(28rem,calc(100vw-2rem))] flex-col items-center justify-center">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse-slow" />
          <div className="absolute inset-2 rounded-full bg-cta/10 blur-lg animate-pulse" />

          <div className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin-slow" />
          <div className="absolute inset-3 rounded-full border-2 border-cta/15 border-b-cta animate-spin-reverse" />

          <div className="h-4 w-4 rounded-full bg-gradient-to-tr from-primary to-cta shadow-[0_0_12px_rgba(99,102,241,0.6)] animate-pulse" />
        </div>

        <div className="mt-8 flex w-full min-w-0 flex-col items-center gap-2 text-center">
          <h3 className="w-full whitespace-nowrap font-sans text-lg font-semibold tracking-wide text-textMain animate-pulse">
            {message}
          </h3>
          {subtitle && (
            <p className="w-full whitespace-nowrap font-mono text-xs tracking-wide text-textSub opacity-75">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
