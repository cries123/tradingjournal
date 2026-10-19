import type { CSSProperties, ReactNode } from 'react';

interface IPhoneFrameProps {
  /**
   * The phone's width in px; every other dimension is drawn from it (see .iphone in index.css).
   * Leave it out to size the phone with a responsive `[--pw:…]` utility in className instead.
   */
  width?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * A current iPhone around whatever the landing page wants to show on it.
 *
 * The status bar is drawn here rather than left in the screenshots, so every phone on the page says
 * 9:41 with full bars — the way Apple photographs them — and the app's own header can be cropped off
 * a screenshot without leaving a hole.
 */
export function IPhoneFrame({ width, className = '', style, children }: IPhoneFrameProps) {
  return (
    <div className={`iphone ${className}`} style={width ? ({ ...style, '--pw': `${width}px` } as CSSProperties) : style}>
      <div className="iphone-screen">
        <div className="iphone-status" aria-hidden>
          <span>9:41</span>
          <i className="iphone-island" />
          <span className="iphone-icons">
            <svg viewBox="0 0 18 12">
              <rect x="0" y="8" width="3" height="4" rx="1" />
              <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
              <rect x="10" y="3" width="3" height="9" rx="1" />
              <rect x="15" y="0" width="3" height="12" rx="1" />
            </svg>
            <svg viewBox="0 0 16 12">
              <path d="M8 12l2.6-3a3.6 3.6 0 0 0-5.2 0z" />
              <path d="M8 6.2c1.6 0 3.1.6 4.2 1.7l1.5-1.7A8 8 0 0 0 8 3.8a8 8 0 0 0-5.7 2.4l1.5 1.7A5.9 5.9 0 0 1 8 6.2z" />
              <path d="M8 1.9c2.9 0 5.6 1.1 7.6 3L16 4.4V4A11.4 11.4 0 0 0 8 0 11.4 11.4 0 0 0 0 4v.4l.4.5c2-1.9 4.7-3 7.6-3z" />
            </svg>
            <svg className="iphone-battery" viewBox="0 0 27 13">
              <rect x=".5" y=".5" width="23" height="12" rx="3.8" fill="none" stroke="#fff" strokeOpacity=".45" />
              <rect x="2" y="2" width="20" height="9" rx="2.4" />
              <path d="M25 4.5v4c.9-.3 1.6-1.1 1.6-2s-.7-1.7-1.6-2z" fillOpacity=".45" />
            </svg>
          </span>
        </div>
        <div className="iphone-content">{children}</div>
      </div>
    </div>
  );
}
