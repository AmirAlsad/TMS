import { useState, useRef, useEffect, useCallback } from 'react';

interface PhoneFrameProps {
  children: React.ReactNode;
}

// SVG viewBox is 450×920. Screen insets as percentages.
const SCREEN_INSET = {
  top: 2.0,
  bottom: 2.0,
  left: 5.0,
  right: 5.0,
};
const SCREEN_RADIUS = '7%';

// Reference screen width (px) at which children render at 1:1 (no zoom).
const REF_WIDTH = 405;

// Minimum container height to render the phone.
const MIN_HEIGHT = 300;

export function PhoneFrame({ children }: PhoneFrameProps) {
  const [svgLoaded, setSvgLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [tooSmall, setTooSmall] = useState(false);

  const updateZoom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const containerH = el.clientHeight;
    if (containerH < MIN_HEIGHT) {
      setTooSmall(true);
      return;
    }
    setTooSmall(false);

    // Compute the phone wrapper's actual pixel dimensions from available height.
    const padding = 32; // p-4 = 16px each side
    const phoneH = Math.min(containerH - padding, 920);
    const phoneW = phoneH * (450 / 920);
    const screenW = phoneW * (1 - SCREEN_INSET.left / 100 - SCREEN_INSET.right / 100);

    setZoom(screenW / REF_WIDTH);
  }, []);

  useEffect(() => {
    updateZoom();
    const ro = new ResizeObserver(updateZoom);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [updateZoom]);

  if (tooSmall) {
    return (
      <div ref={containerRef} className="flex items-center justify-center h-full p-4 lg:p-6">
        <p className="text-sm text-slate-400 dark:text-slate-500 text-center">
          Not enough space to render phone screen.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex items-center justify-center h-full p-4 lg:p-6">
      {/* Outer wrapper locks to the SVG's native 450:920 aspect ratio */}
      <div className="relative h-full max-h-[920px] aspect-[450/920]">
        {/* Phone bezel SVG overlay */}
        <img
          src="/assets/iphone-17.svg"
          alt=""
          className="absolute inset-0 w-full h-full z-20 pointer-events-none select-none"
          onLoad={() => setSvgLoaded(true)}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
            setSvgLoaded(false);
          }}
        />

        {/* CSS fallback bezel — only visible when SVG fails to load */}
        {!svgLoaded && (
          <div
            className="absolute inset-0 rounded-[3rem] border-[6px] border-neutral-900
                        dark:border-neutral-600 phone-shadow pointer-events-none z-10"
          />
        )}

        {/* Screen content area — positioned to match the SVG's screen cutout */}
        <div
          className="absolute overflow-hidden flex flex-col bg-black z-[1]"
          style={{
            ...(svgLoaded
              ? {
                  top: `${SCREEN_INSET.top}%`,
                  bottom: `${SCREEN_INSET.bottom}%`,
                  left: `${SCREEN_INSET.left}%`,
                  right: `${SCREEN_INSET.right}%`,
                  borderRadius: SCREEN_RADIUS,
                }
              : {
                  top: '6px',
                  bottom: '6px',
                  left: '6px',
                  right: '6px',
                  borderRadius: 'calc(3rem - 6px)',
                }),
            zoom,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
