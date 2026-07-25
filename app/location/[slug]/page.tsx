// app/location/[slug]/page.tsx — a location page, as a field-guide entry.
//
// The place is the hero: name in the display serif, tagged with a specimen-style
// coordinate + locality label (the signature device). Facts are set quietly like
// a guide's margin notes. Moments (photos + field notes) are the living content.
//
// NEXT.JS 16: `params` is a Promise and must be awaited.

import type { Metadata } from "next";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { LocationDetailsSchema } from "@/lib/schemas/location";
import { getSessionUser } from "@/lib/auth";
import { resolveMediaSrc } from "@/lib/media/resolve";
import { signMediaUrl } from "@/lib/media/sign";
import {
  publicLocationWhere,
  publicMomentWhere,
  publicMediaWhere,
} from "@/lib/queries/visibility";
import { MomentGrid, type ViewerMoment } from "./MomentGrid";
import { RatingBlock } from "./RatingBlock";
import { BackToMap } from "@/components/BackToMap";
import { MapBackdropShell } from "@/components/MapBackdropShell";

// ---------------------------------------------------------------------------
// Share preview (PLAN.md Phase 2): OG tags are the product's actual growth
// mechanism — a location link pasted into a group chat should unfurl into the
// place's name, intro, and face. No share buttons anywhere; the URL is the
// share, so the URL has to look good.
// ---------------------------------------------------------------------------

const SITE_URL = process.env.APP_URL ?? "http://localhost:3000";

// OG image TTL: scrapers (iMessage, WhatsApp, Slack) cache the image URL and
// may re-fetch days after the first share, so the default 1-hour media
// signature would leave broken previews behind. Seven days is long enough for
// a share's social life, short enough that a takedown still ages links out.
const OG_IMAGE_TTL_SECONDS = 7 * 24 * 60 * 60;

function ogImageUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  // Seed/placeholder assets under /public — stable public paths already.
  if (key.startsWith("/")) return `${SITE_URL}${key}`;
  return `${SITE_URL}${signMediaUrl(key, OG_IMAGE_TTL_SECONDS)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const location = await db.location.findFirst({
    where: { slug, ...publicLocationWhere },
    select: {
      name: true,
      intro: true,
      state: true,
      suburb: true,
      heroMediaId: true,
      coverKey: true,
    },
  });
  if (!location) return {}; // the page will 404; nothing to describe

  // Same face the page shows: promoted community photo → curator cover.
  let imageKey: string | null = location.coverKey;
  if (location.heroMediaId) {
    const hero = await db.momentMedia.findFirst({
      where: { id: location.heroMediaId, ...publicMediaWhere },
      select: { mediaKey: true },
    });
    if (hero) imageKey = hero.mediaKey;
  }
  const image = ogImageUrl(imageKey);

  const title = `${location.name} — Australia Is Beautiful`;
  const where = location.suburb
    ? `${location.suburb}, ${location.state}`
    : location.state;
  const description =
    location.intro.length > 200
      ? `${location.intro.slice(0, 197)}…`
      : location.intro || `Discover ${location.name} in ${where}.`;

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: `/location/${slug}` },
    openGraph: {
      title,
      description,
      url: `/location/${slug}`,
      siteName: "Australia Is Beautiful",
      type: "article",
      ...(image ? { images: [{ url: image, alt: location.name }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

// Decimal degrees → a specimen-label coordinate, e.g. "37.807°S 144.892°E".
function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(3)}°${ns}  ${Math.abs(lng).toFixed(3)}°${ew}`;
}

export default async function LocationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const location = await db.location.findFirst({
    where: { slug, ...publicLocationWhere },
    include: {
      moments: {
        where: publicMomentWhere,
        orderBy: { createdAt: "desc" },
        include: {
          media: {
            where: publicMediaWhere,
            orderBy: { position: "asc" },
          },
        },
      },
    },
  });

  if (!location) {
    notFound();
  }

  const details = LocationDetailsSchema.parse(location.details ?? {});

  // Who's looking — so the viewer knows which moments this person has already
  // reacted to. Signed-out visitors see counts but no "you reacted" state; the
  // gentle wall appears only when they try to react.
  const viewer = await getSessionUser();
  const myRating = viewer
    ? await db.rating.findUnique({
        where: {
          locationId_userId: { locationId: location.id, userId: viewer.id },
        },
        select: { score: true },
      })
    : null;
  const myReactions = viewer
    ? new Set(
        (
          await db.reaction.findMany({
            where: {
              userId: viewer.id,
              momentId: { in: location.moments.map((m) => m.id) },
            },
            select: { momentId: true },
          })
        ).map((r) => r.momentId),
      )
    : new Set<string>();

  // The place's face: a promoted COMMUNITY photo wins; the curator's provisional
  // cover holds the space until one exists.
  let heroSrc: string | null = null;
  if (location.heroMediaId) {
    const hero = await db.momentMedia.findFirst({
      where: { id: location.heroMediaId, ...publicMediaWhere },
      select: { mediaKey: true },
    });
    heroSrc = resolveMediaSrc(hero?.mediaKey);
  }
  if (!heroSrc) heroSrc = resolveMediaSrc(location.coverKey);

  const moments: ViewerMoment[] = location.moments
    .filter((m) => m.media.length > 0)
    .map((m) => ({
      id: m.id,
      caption: m.caption,
      createdAt: m.createdAt.toISOString(),
      reactionCount: m.reactionCount,
      viewerReacted: myReactions.has(m.id),
      media: m.media.map((mm) => ({
        id: mm.id,
        src: resolveMediaSrc(mm.mediaKey) ?? "",
      })),
    }));

  // Facts we actually know — set quietly, no invented data.
  const facts: { label: string; value: string }[] = [];
  if (location.address) facts.push({ label: "Where", value: location.address });
  if (details.entryFee?.free) facts.push({ label: "Entry", value: "Free" });
  if (details.bestTimeToVisit)
    facts.push({ label: "Best time", value: details.bestTimeToVisit });
  if (details.facilities?.length)
    facts.push({
      label: "Facilities",
      value: details.facilities
        .map((f) => f.toLowerCase().replace(/_/g, " "))
        .join(", "),
    });

  return (
    <>
      {/* Contours, not the map snapshot: most visitors arrive here from a
          SHARED LINK with no map session behind them, so there's usually no
          snapshot to show — and this page's hero photo is the visual lead;
          the backdrop must stay abstract under it. */}
      <MapBackdropShell variant="contours" />
      <main className="relative mx-auto w-full max-w-3xl flex-1 px-6 py-8 sm:px-8">
      {/* No SiteHeader (see its note): just the quiet way back. */}
      <BackToMap />

      {/* Field-guide header. The signature: the specimen coordinate label. */}
      <header className="mt-10 border-b border-[var(--border)] pb-8">
        {/* The place's face — a real photo of somewhere real. */}
        {heroSrc && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroSrc}
            alt={location.name}
            className="mb-8 aspect-[16/9] w-full rounded-lg object-cover"
          />
        )}
        <p className="specimen-label text-[var(--ochre)]">
          {formatCoords(location.latitude, location.longitude)}
          {"   ·   "}
          {location.suburb ? `${location.suburb}, ` : ""}
          {location.state}
        </p>
        <h1
          className="mt-4 text-5xl leading-[1.05] tracking-tight text-[var(--ink)] sm:text-6xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {location.name}
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--foreground)]/85">
          {location.intro}
        </p>
      </header>

      {/* Rating — the place's, never a person's. Hidden until the threshold. */}
      <RatingBlock
        locationId={location.id}
        slug={slug}
        signedIn={!!viewer}
        initialAvg={location.ratingAvg}
        initialCount={location.ratingCount}
        threshold={location.ratingThreshold}
        initialMyScore={myRating?.score ?? null}
      />

      {/* Facts — a quiet two-column margin-notes block. */}
      {facts.length > 0 && (
        <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {facts.map((f) => (
            <div
              key={f.label}
              className="flex gap-3 border-b border-[var(--border)]/60 pb-3"
            >
              <dt className="specimen-label w-24 shrink-0 pt-0.5">
                {f.label}
              </dt>
              <dd className="text-[var(--foreground)]/90 capitalize">
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* Experiences — the living content. */}
      <section className="mt-14">
        <div className="flex items-baseline justify-between">
          <h2 className="specimen-label">Experiences here</h2>
          {/* The contribute path. Viewing is open to all; contributing asks for
              an account at the moment of intent (the gentle wall, UX §7b) — the
              contribute page handles that redirect. */}
          <Link
            href={`/contribute/${slug}`}
            className="text-sm text-[var(--eucalypt)] underline-offset-4 hover:underline"
          >
            Add your photos
          </Link>
        </div>
        <MomentGrid moments={moments} slug={slug} signedIn={!!viewer} />
      </section>
      </main>
    </>
  );
}
