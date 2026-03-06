interface PhoneFrameProps {
  children: React.ReactNode;
}

export function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className="flex items-center justify-center h-full p-4 lg:p-6">
      <div
        className="relative w-full max-w-[390px] h-full max-h-[844px]
                    rounded-[3rem] border-[6px] border-neutral-900 dark:border-neutral-600
                    bg-black overflow-hidden phone-shadow"
      >
        {/* Dynamic Island */}
        <div
          className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[120px] h-[35px]
                      bg-black rounded-[18px] z-20"
        />

        {/* Screen */}
        <div className="h-full flex flex-col overflow-hidden rounded-[calc(3rem-6px)]">
          {children}
        </div>

        {/* Home Indicator */}
        <div
          className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[134px] h-[5px]
                      bg-white/30 rounded-full z-20 pointer-events-none"
        />
      </div>
    </div>
  );
}
