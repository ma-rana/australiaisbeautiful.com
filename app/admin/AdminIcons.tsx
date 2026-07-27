// app/admin/AdminIcons.tsx — the rail's icon set.
//
// Same drawing rules as the public set (components/icons.tsx): one 24px grid,
// 2.1 stroke, round caps and joins — so staff and public surfaces read as the
// same hand even though their palettes differ. Kept as a separate file because
// these glyphs are workbench vocabulary (queues, shields, accounts) that the
// public site must never need; importing them there would be a smell.
//
// Every glyph is sized for the rail's 20px slot and legible at that size —
// no fine detail that turns to mush small.

import type { SVGProps } from "react";

const STROKE = 2.1;

type IconProps = Omit<SVGProps<SVGSVGElement>, "strokeWidth"> & {
  size?: number;
  strokeWidth?: number;
};

function base(
  { size = 20, strokeWidth = STROKE, ...rest }: IconProps,
  children: React.ReactNode,
) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

// The map — a folded chart, the spatial surface.
export const MapIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M9 4.5L3.8 6.3v13.2L9 17.7l6 1.8 5.2-1.8V4.5L15 6.3 9 4.5z" />
      <path d="M9 4.5v13.2" />
      <path d="M15 6.3v13.2" />
    </>,
  );

// Requests — an inbox tray: suggestions arriving, waiting to be picked up.
export const InboxIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M4.5 13.5L6.8 5.5h10.4l2.3 8" />
      <path d="M4.5 13.5h4.2l1.5 2.6h3.6l1.5-2.6h4.2v4.7a1.3 1.3 0 01-1.3 1.3H5.8a1.3 1.3 0 01-1.3-1.3v-4.7z" />
    </>,
  );

// Places — the marker pin. A pin is fine HERE (the admin authors precise
// coordinates); the public map's area-circle reasoning doesn't apply to a
// nav glyph.
export const PinIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M12 21c-4.5-4.2-6.8-7.4-6.8-10.4a6.8 6.8 0 0113.6 0c0 3-2.3 6.2-6.8 10.4z" />
      <circle cx="12" cy="10.5" r="2.3" />
    </>,
  );

// Moments — a photograph.
export const PhotoIcon = (p: IconProps) =>
  base(
    p,
    <>
      <rect x="3.8" y="5" width="16.4" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <path d="M20 15.5l-4.3-4.3L7 19" />
    </>,
  );

// Takedowns — a shield with a mark: the protective, legal-facing queue.
export const ShieldIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M12 3.2l7 2.8v5.4c0 4.3-2.9 7.5-7 9.4-4.1-1.9-7-5.1-7-9.4V6l7-2.8z" />
      <path d="M12 8.6v4.2" />
      <path d="M12 15.9h.01" />
    </>,
  );

// Accounts — two figures: the people who hold the keys.
export const UsersIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="9.2" cy="8.6" r="3.1" />
      <path d="M3.8 19.4c.6-3.1 2.7-4.9 5.4-4.9s4.8 1.8 5.4 4.9" />
      <path d="M15.4 6a3.1 3.1 0 010 5.3" />
      <path d="M16.8 14.7c1.9.7 3.1 2.3 3.5 4.7" />
    </>,
  );

// Security — a key. Clearer at 20px than a gear's teeth.
export const KeyIcon = (p: IconProps) =>
  base(
    p,
    <>
      <circle cx="8" cy="15.5" r="4" />
      <path d="M10.8 12.7L19.5 4" />
      <path d="M16 7.5l3 3" />
      <path d="M13.5 10l2 2" />
    </>,
  );

// Messages — the support/help/feedback inbox. A speech bubble: someone is
// telling you something. Distinct from InboxIcon (a tray of arriving requests)
// and PhotoIcon, so the three queues never read alike at rail size.
export const MessageIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M5 5h14a1.5 1.5 0 011.5 1.5v8A1.5 1.5 0 0119 16H9l-4 3.5V16a1.5 1.5 0 01-1.5-1.5v-8A1.5 1.5 0 015 5z" />
      <path d="M8.5 9.5h7" />
      <path d="M8.5 12.5h4.5" />
    </>,
  );

// The rail's collapse / expand control — double chevrons, like every
// minimizable side panel people already know.
export const CollapseIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M11.5 7l-5 5 5 5" />
      <path d="M18 7l-5 5 5 5" />
    </>,
  );
export const ExpandIcon = (p: IconProps) =>
  base(
    p,
    <>
      <path d="M6 7l5 5-5 5" />
      <path d="M12.5 7l5 5-5 5" />
    </>,
  );
