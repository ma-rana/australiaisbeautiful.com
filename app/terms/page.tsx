// app/terms/page.tsx — the terms of use.
//
// Plain-language terms describing the actual deal: browsing is open, an account
// lets you contribute, you keep ownership of what you upload but grant us the
// licence to show it, and contributions are moderated and shown anonymously.
//
// PLACEHOLDERS to fill before launch: the operator/entity name and the
// governing-law locality (state). Search "TODO" below.

import { LegalPage } from "@/components/LegalPage";

export const metadata = {
  title: "Terms of use — Australia Is Beautiful",
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="August 2026">
      <p>
        These terms cover your use of Australia Is Beautiful. By using the site
        — browsing it, creating an account, or contributing — you agree to them.
        We&apos;ve kept them as plain as we can.
      </p>

      <div className="legal-aside">
        <p>
          These terms are written in good faith and are not legal advice. They
          may not address every situation. If something here is unclear, contact
          us through the <a href="/help">help &amp; feedback</a> page.
        </p>
      </div>

      <h2>Using the site</h2>
      <p>
        Anyone can browse Australia Is Beautiful — look at places, read field
        notes, and view photos — without an account. You need an account only to
        contribute: to upload photos, write notes, rate places, save them, or
        suggest new ones.
      </p>
      <p>
        You&apos;re responsible for keeping your account secure and for what
        happens under it. Let us know promptly if you think someone else has
        access to it.
      </p>

      <h2>Your contributions</h2>

      <h3>You own what you make</h3>
      <p>
        The photos and notes you upload remain <strong>yours</strong>. Creating
        an account doesn&apos;t transfer ownership of your work to us.
      </p>

      <h3>The permission you give us</h3>
      <p>
        So that we can actually show your contribution as part of the guide, you
        give us a non-exclusive, royalty-free licence to store, re-encode,
        display, and distribute the photos and notes you submit, as part of the
        place they belong to, on this site and in link previews when a place is
        shared. This licence exists only to run the service. It ends for a given
        piece of content when you delete it (see below), except where it has
        already been shared onward by others or is required to be retained for
        legal reasons.
      </p>

      <h3>What you promise about what you upload</h3>
      <p>By uploading, you confirm that:</p>
      <ul>
        <li>
          The photos are <strong>yours</strong> — you took them, or you have the
          right to share them.
        </li>
        <li>
          They don&apos;t infringe anyone else&apos;s copyright, privacy, or
          other rights.
        </li>
        <li>
          They&apos;re honest — a real photo of a real place, not misleading or
          faked.
        </li>
        <li>
          They don&apos;t contain unlawful, hateful, harassing, or explicit
          content, and don&apos;t identify or target other people without their
          consent.
        </li>
      </ul>

      <h3>Contributions are anonymous and reviewed</h3>
      <p>
        Everything you contribute is shown <strong>without your name</strong> —
        as &ldquo;an Explorer,&rdquo; never as a personal post. There are no
        public profiles, followers, or author credits on this site by design.
      </p>
      <p>
        Contributions are <strong>reviewed by a person</strong> before they
        appear publicly. We may decline or remove content that doesn&apos;t fit
        the guide or breaks these terms. We aim to review promptly and to tell
        you when your content goes live or isn&apos;t approved, but we don&apos;t
        guarantee that any particular contribution will be published.
      </p>

      <h2>Deleting your content</h2>
      <p>
        You can delete your own photos at any time, and they&apos;re removed
        permanently. You can delete your whole account from your settings, which
        removes your own contributions. Some anonymous aggregates you contributed
        to — such as a place&apos;s average rating — remain as aggregates,
        because they aren&apos;t identifiable to you. This is described in the{" "}
        <a href="/privacy">privacy policy</a>.
      </p>

      <h2>What you may not do</h2>
      <ul>
        <li>
          Upload content you don&apos;t have the right to, or that breaks the
          promises above.
        </li>
        <li>
          Abuse, harass, or endanger others, or use the site to do so.
        </li>
        <li>
          Attempt to break, overload, scrape at scale, or gain unauthorised
          access to the site or other people&apos;s accounts.
        </li>
        <li>
          Misuse the &ldquo;suggest a place&rdquo; or reporting features — for
          example, spamming requests or false reports.
        </li>
      </ul>
      <p>
        We may suspend or remove accounts that break these terms, to protect the
        guide and the people using it.
      </p>

      <h2>The guide is curated, not comprehensive</h2>
      <p>
        Places are added deliberately, and field notes come from other people.
        We do our best to keep things accurate, but we can&apos;t guarantee that
        every detail — conditions, access, opening times, safety — is current or
        correct. <strong>Use your own judgement</strong>, especially outdoors.
        You&apos;re responsible for your own safety when visiting any place you
        find here.
      </p>

      <h2>Availability</h2>
      <p>
        We offer the site as it is and as available. We may change, pause, or
        discontinue features, and we don&apos;t promise the site will always be
        available or error-free. To the extent the law allows, we&apos;re not
        liable for loss arising from your use of the site or from places you
        visit because of it. Nothing in these terms limits rights you have under
        Australian Consumer Law that can&apos;t be excluded.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        We may update these terms. When we do, we&apos;ll change the &ldquo;last
        updated&rdquo; date above, and significant changes will be made clear.
        Continuing to use the site after a change means you accept the updated
        terms.
      </p>

      <h2>Governing law</h2>
      <p>
        These terms are governed by the laws of the State of Victoria,
        Australia, and you and we submit to the courts of that State.
      </p>

      <h2>Contact</h2>
      <div className="legal-aside">
        <p>
          Questions about these terms, or to report content, reach us through the{" "}
          <a href="/help">help &amp; feedback</a> page, or at:
        </p>
        <p>
          <strong>basanta.rana.ma@gmail.com</strong>
        </p>
      </div>
    </LegalPage>
  );
}
