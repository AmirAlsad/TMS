export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-slide-up">
      <div
        className="px-4 py-3 rounded-lg rounded-tl-none shadow-sm
                   bg-white dark:bg-[#202c33]"
      >
        <div className="flex gap-1 items-center h-4">
          <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-typing-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-typing-bounce [animation-delay:200ms]" />
          <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 animate-typing-bounce [animation-delay:400ms]" />
        </div>
      </div>
    </div>
  );
}
