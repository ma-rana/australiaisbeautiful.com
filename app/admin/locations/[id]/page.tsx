// app/admin/locations/[id]/page.tsx — edit one place.
//
// Full curator control: the write-up, practical details, the pin, the cover
// image, and which contributed photo is the place's face.

import { db } from "@/lib/db";
import { requireCurator, getSessionUser, ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { LocationDetailsSchema } from "@/lib/schemas/location";
import { resolveMediaSrc } from "@/lib/media/resolve";
import { EditLocationForm } from "./EditLocationForm";
import { TakedownPanel } from "./TakedownPanel";

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireCurator();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/signin");
    if (e instanceof ForbiddenError) {
      return (
        <main className="mx-auto max-w-2xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Not authorised</h1>
        </main>
      );
    }
    throw e;
  }

  const { id } = await params;

  // Who's looking — curators request takedowns, admins act on them.
  const viewer = await getSessionUser();
  const isAdmin = viewer?.role === "ADMIN";

  const location = await db.location.findUnique({
    where: { id },
    include: {
      moments: {
        where: { status: "APPROVED", isPublic: true },
        orderBy: { createdAt: "desc" },
        include: {
          media: {
            where: { status: "APPROVED" },
            orderBy: { position: "asc" },
            select: { id: true, thumbKey: true, mediaKey: true },
          },
        },
      },
    },
  });
  if (!location) notFound();

  const details = LocationDetailsSchema.parse(location.details ?? {});

  // Is a takedown already with an admin?
  const openRequest = await db.escalation.findFirst({
    where: {
      targetType: "LOCATION",
      targetId: location.id,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
    select: { id: true },
  });

  const momentCount = await db.moment.count({ where: { locationId: location.id } });

  // Every approved contributed photo — candidates for the hero.
  const candidates = location.moments.flatMap((m) =>
    m.media.map((mm) => ({
      id: mm.id,
      src: resolveMediaSrc(mm.thumbKey ?? mm.mediaKey) ?? "",
    })),
  );

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href="/locations"
        className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        ← All places
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">{location.name}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        /location/{location.slug}
      </p>

      <EditLocationForm
        location={{
          id: location.id,
          slug: location.slug,
          name: location.name,
          intro: location.intro,
          category: location.category,
          state: location.state,
          suburb: location.suburb ?? "",
          address: location.address ?? "",
          latitude: location.latitude,
          longitude: location.longitude,
          coverKey: resolveMediaSrc(location.coverKey),
          heroMediaId: location.heroMediaId,
          details: {
            bestTimeToVisit: details.bestTimeToVisit ?? "",
            accessNotes: details.accessNotes ?? "",
            facilities: details.facilities ?? [],
            entryFeeFree: details.entryFee?.free ?? true,
            entryFeeNote: details.entryFee?.note ?? "",
            warnings: (details.warnings ?? []).join("\n"),
            traditionalOwners: details.traditionalOwners ?? "",
          },
        }}
        candidates={candidates}
      />

      {/* Removing a place — curators request, admins decide. */}
      <div className="mt-12">
        <TakedownPanel
          locationId={location.id}
          isAdmin={isAdmin}
          status={location.status}
          momentCount={momentCount}
          hasOpenRequest={!!openRequest}
        />
      </div>
    </main>
  );
}
