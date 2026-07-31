// app/privacy/page.tsx — the privacy policy.
//
// Written to describe what the app ACTUALLY does, not a generic template. The
// product collects little and refuses tracking by design, so the policy can
// honestly say things most can't ("we don't track your movements", "there is no
// public profile"). Keep this in sync with real behaviour: if a future change
// starts collecting or sharing something new, this page must change with it.
//
// PLACEHOLDERS to fill before launch: the contact email, the operator/entity
// name, and the governing-law locality. Search "TODO" below.

import { LegalPage } from "@/components/LegalPage";

export const metadata = {
  title: "Privacy — Australia Is Beautiful",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="August 2026">
      <p>
        Australia Is Beautiful is a place-first guide to Australian locations.
        This page explains what information we collect, why, and what we do and
        don&apos;t do with it. It&apos;s written to be read, not to hide behind
        legalese.
      </p>

      <p>
        The short version: we collect the little we need to let you sign in and
        contribute, we don&apos;t track your movements, and we don&apos;t build
        a public profile of you. Everything you contribute is shown without your
        name attached.
      </p>

      <div className="legal-aside">
        <p>
          This policy is written in good faith to describe our actual practices.
          It is not legal advice, and it may not cover every obligation that
          applies to you or to us. If you have a specific concern, please get in
          touch — see the contact section at the end.
        </p>
      </div>

      <h2>What we collect</h2>

      <h3>When you create an account</h3>
      <p>
        Your <strong>email address</strong> and a <strong>password</strong>. The
        password is stored only as a secure one-way hash — we never store or can
        read your actual password. If you sign in with Google instead, we
        receive your email address from Google to identify your account; we
        don&apos;t receive your Google password.
      </p>
      <p>
        We ask for <strong>nothing else</strong> at sign-up: no name, no
        username, no avatar, no bio. The account exists so you can contribute,
        not so you can build an identity — there are no public profiles here.
      </p>

      <h3>When you contribute</h3>
      <p>Depending on what you do, we store:</p>
      <ul>
        <li>
          <strong>Photos you upload</strong>, and the field notes (captions) you
          write about a place.
        </li>
        <li>
          <strong>Ratings and reactions</strong> you give to places and moments.
        </li>
        <li>
          <strong>Places you save</strong>, and{" "}
          <strong>places you suggest</strong> adding to the map (a pin, a name,
          and an optional note).
        </li>
      </ul>
      <p>
        When you upload a photo, we re-encode it and{" "}
        <strong>strip its embedded metadata (EXIF)</strong> — including any GPS
        coordinates your camera may have recorded — before it&apos;s stored or
        shown. The original file you selected is never served to anyone; only the
        cleaned, re-encoded version is.
      </p>

      <h3>About your location</h3>
      <p>
        If you tap <strong>&ldquo;Near me&rdquo;</strong>, your browser asks your
        permission and, if you agree, gives us your approximate position{" "}
        <strong>once</strong>, so we can center the map on you and show nearby
        places. We use it in that moment and <strong>do not store it</strong>. We
        never track your location in the background, and we never build a history
        of where you&apos;ve been. &ldquo;Near me&rdquo; is always something you
        choose to tap — the site never reads your location on its own.
      </p>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>
          <strong>We don&apos;t track your movements</strong> or keep a location
          history.
        </li>
        <li>
          <strong>We don&apos;t sell your data</strong> to anyone, ever.
        </li>
        <li>
          <strong>We don&apos;t attribute your contributions publicly.</strong>{" "}
          Your photos and notes appear as shared by &ldquo;an Explorer,&rdquo;
          never under your name. Your ratings are counted anonymously. Places you
          suggest are never publicly credited to you.
        </li>
        <li>
          <strong>We don&apos;t build advertising profiles</strong> or share your
          information with advertisers.
        </li>
      </ul>

      <h2>How we use what we collect</h2>
      <p>We use your information only to run the service:</p>
      <ul>
        <li>To let you sign in and keep your account secure.</li>
        <li>
          To publish your contributions (after review) as part of a place&apos;s
          page — anonymously.
        </li>
        <li>
          To send you a small number of service emails: verifying your address,
          and letting you know when a moment you shared goes live, isn&apos;t
          approved, or a place you suggested is added. You can turn these off.
        </li>
        <li>
          To understand overall activity on the site in aggregate (how many
          places, how many contributions) — never as a per-person trail.
        </li>
      </ul>

      <h2>Content review</h2>
      <p>
        Photos and notes you upload are reviewed by a person before they appear
        publicly. This is to keep the guide accurate and safe. A reviewer can see
        what you submitted in order to approve or decline it; declined content
        and enforcement actions are kept as a record so the review process works,
        but this is never shown publicly or attributed to you elsewhere.
      </p>

      <h2>Cookies</h2>
      <p>
        We use a single <strong>essential cookie</strong> to keep you signed in.
        We don&apos;t use advertising cookies or third-party tracking cookies. If
        you sign in with Google, Google may set its own cookies as part of that
        sign-in — that&apos;s governed by Google&apos;s privacy policy.
      </p>

      <h2>Who else is involved</h2>
      <p>A few services help us run the site:</p>
      <ul>
        <li>
          <strong>Google</strong> — only if you choose to sign in with Google,
          and only to identify your account.
        </li>
        <li>
          <strong>Our email provider</strong> — to deliver the account and
          notification emails described above.
        </li>
        <li>
          <strong>Our hosting provider</strong> — the servers that run the site
          and store its data.
        </li>
      </ul>
      <p>
        The map itself is served from our own servers — it doesn&apos;t call out
        to Google Maps or a third-party tile service, so browsing the map
        doesn&apos;t share your activity with a map company.
      </p>

      <h2>Your control over your data</h2>
      <ul>
        <li>
          <strong>Delete a moment.</strong> When you delete your own photo, it is
          removed permanently — the file and its record are gone, not hidden.
        </li>
        <li>
          <strong>Delete your account.</strong> You can delete your account from
          your settings. This permanently removes your own photos and notes.
          Contributions that only survive as anonymous aggregates — for example,
          your rating folded into a place&apos;s average — remain as those
          aggregates, de-linked from you, because they were never identifiable to
          begin with.
        </li>
        <li>
          <strong>Access and correction.</strong> You can ask us what personal
          information we hold about you and ask us to correct it. Contact us at
          the address below.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        This service isn&apos;t intended for children under 15. We don&apos;t
        knowingly collect information from them. If you believe a child has
        created an account, please contact us and we&apos;ll remove it.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change how we handle your information, we&apos;ll update this page
        and the &ldquo;last updated&rdquo; date above. Significant changes will
        be made clear.
      </p>

      <h2>Contact</h2>
      <div className="legal-aside">
        <p>
          Questions about your privacy, or requests to access, correct, or delete
          your information:
        </p>
        <p>
          {/* TODO: replace with your real contact email before launch. */}
          <strong>privacy@australiaisbeautiful.com</strong>
        </p>
        <p>
          You can also reach us through the{" "}
          <a href="/help">help &amp; feedback</a> page.
        </p>
      </div>
    </LegalPage>
  );
}
