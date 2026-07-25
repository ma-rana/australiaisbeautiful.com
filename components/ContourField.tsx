// components/ContourField.tsx — the topographic contour background.
//
// Extracted from AuthShell when the map-snapshot backdrop needed the same
// fallback: elevation contours are the site's "map-world without a map"
// texture, used wherever a live or captured map isn't available. One copy so
// the two surfaces can't drift.
//
// Hand-placed paths in the site's hairline colour: two contour systems (a
// closed "peak" upper-left, an open system running off-canvas lower-right, the
// way real map sheets crop them), a sparse valley between, and one faint
// eucalypt index contour — the accent every fifth line gets on a real topo
// sheet. Costs ~1KB, inherits dark mode through the CSS variables.

export function ContourField() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.5]"
      viewBox="0 0 800 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      stroke="var(--border)"
      strokeWidth="1.1"
    >
      {/* A "peak" in the upper left — nested closed contours. */}
      <path d="M-60 130 C 40 40, 200 30, 260 110 C 320 190, 260 290, 150 300 C 40 310, -110 220, -60 130 Z" />
      <path d="M-40 145 C 45 70, 175 60, 225 125 C 275 190, 230 262, 140 271 C 50 280, -80 215, -40 145 Z" />
      <path d="M-15 160 C 50 100, 150 92, 190 140 C 230 188, 198 236, 128 243 C 58 250, -50 213, -15 160 Z" />
      <path d="M12 172 C 58 130, 128 124, 156 156 C 184 188, 162 216, 114 221 C 66 226, -14 210, 12 172 Z" />

      {/* A second, larger system lower right — open contours running
          off-canvas, the way real map sheets crop them. */}
      <path d="M820 470 C 700 430, 560 460, 520 560 C 480 660, 560 760, 700 790 C 780 806, 830 800, 900 780" />
      <path d="M830 510 C 730 480, 610 505, 578 585 C 546 665, 610 738, 720 762 C 780 774, 830 770, 890 755" />
      <path d="M840 550 C 760 528, 660 548, 634 608 C 608 668, 656 720, 740 738 C 790 748, 840 744, 885 733" />
      <path d="M850 588 C 790 572, 712 588, 692 630 C 672 672, 706 706, 766 718 C 806 726, 848 722, 880 714" />

      {/* Sparse mid-field lines — a valley between the two. */}
      <path d="M-40 520 C 120 470, 300 500, 420 440 C 520 390, 560 300, 640 260" />
      <path d="M-40 580 C 130 535, 310 560, 430 505 C 530 458, 590 372, 680 330" />

      {/* One index contour in eucalypt, faint. */}
      <path
        d="M-30 655 C 150 605, 330 630, 450 575 C 550 528, 620 445, 720 405"
        stroke="var(--eucalypt)"
        strokeOpacity="0.35"
      />
    </svg>
  );
}
