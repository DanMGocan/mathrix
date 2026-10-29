import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Mathrix",
  description:
    "How Mathrix handles account, gameplay, advertising and payment data.",
};

export default function Privacy() {
  return (
    <article className="page prose legal-page">
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: 5 October 2026</p>
      <p>
        This policy explains how Mathrix at mathrix.app handles personal data
        when you visit, play, create an account or use an available paid
        feature. Features described below apply when they are available to you.
        Our <Link href="/terms">Terms of Service</Link> describe the rules for
        using the game.
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        Mathrix is operated by <strong>Blouticelli Games Limited</strong>,
        Ireland, the controller of personal data described in this policy. “We”,
        “us” and “our” refer to Blouticelli Games Limited.
      </p>
      <p>
        Postal address: 11, College Court, Portobello, Dublin, Ireland.
        <br />
        Privacy and support contact:{" "}
        <a href="mailto:contact@mathrix.app">contact@mathrix.app</a>.
      </p>

      <h2>2. Information we collect</h2>
      <ul>
        <li>
          <strong>Account and profile information.</strong> Your name, username,
          email address, account identifiers, hashed password, account status
          and chosen profile details. City, country and avatar choices are
          optional where offered. If you sign in with Google or Discord, we
          receive the profile information and identifiers that provider shares
          for sign-in, and store the credentials needed to maintain that link.
          We do not receive your Google or Discord password.
        </li>
        <li>
          <strong>Guest information.</strong> A guest identifier, display name
          and session. Where saved guest profiles are offered, we also store
          ratings, statistics and match history, and provide a private recovery
          code. A guest code gives access to the profile; keep it secret.
          Importing a guest into a new account transfers its saved progress.
        </li>
        <li>
          <strong>Gameplay.</strong> Match participants, moves, game events,
          timestamps, disconnects, scores, results, ratings and statistics.
          Local practice does not add matches to your server-side history or
          rating, although visiting the page still involves normal web requests.
        </li>
        <li>
          <strong>Technical and security information.</strong> IP addresses,
          browser and device information, request logs, session identifiers and
          connection events used to deliver and protect the service. We also
          collect operational measurements such as server performance and queue
          times. Aggregate performance history does not contain player
          identifiers or request contents.
        </li>
        <li>
          <strong>Advertising.</strong> For house campaigns, we record the
          campaign, player identifier, match identifier, impression time and
          whether you clicked. Google advertising may collect the information
          described in section 5.
        </li>
        <li>
          <strong>Payments and correspondence.</strong> If you buy Premium,
          Stripe receives payment and billing information. We send Stripe your
          account email and an internal account identifier, and store customer,
          checkout and subscription identifiers, payment-related status,
          cancellation status and your paid-through date. Card details are
          entered on Stripe’s pages; Mathrix does not store full card numbers or
          security codes. If you contact us, we receive what you send us.
        </li>
      </ul>

      <h2>3. Why we use information</h2>
      <p>
        We use account, session, gameplay and subscription data to provide the
        service you request, including sign-in, matchmaking, saved progress,
        billing and support. Where the GDPR or similar rules apply, the legal
        basis is performance of our contract with you or steps you request
        before entering it.
      </p>
      <p>
        We use security logs, fair-play checks, operational measurements and
        house-campaign counts for our legitimate interests in preventing abuse,
        keeping matches fair, maintaining a reliable service and measuring
        campaigns, subject to your rights. We rely on consent for advertising
        storage or personalization where required, and on legal obligations for
        records or disclosures the law requires. Optional public profile details
        are displayed at your request and can be removed in Profile.
      </p>
      <p>
        Matchmaking, scoring and ratings are calculated automatically from game
        rules and results. These determine your in-game experience, not legal or
        similarly significant decisions about you. Required account or payment
        details are necessary for the corresponding feature; optional profile
        fields are not required to play.
      </p>

      <h2>4. What other people can see</h2>
      <p>
        Other players can see your display name, game actions and results.
        Leaderboards show names, ratings and game statistics. Where available,
        selected avatars, city, country and Premium status are also public.
        Avoid putting private information in your public name or profile.
        Detailed saved matches are available to their participants and
        administrators. Authorized administrators can review accounts and game
        history to operate the service and investigate abuse.
      </p>
      <p>
        Your email address, password hash, sign-in tokens, billing identifiers
        and guest recovery code are not part of your public player profile.
      </p>

      <h2>5. Cookies, browser storage and advertising</h2>
      <p>
        Essential cookies keep you signed in and help prevent duplicate tabs or
        account switching from matching you against yourself. Account sessions
        last seven days and can renew while you use the service. Guest sessions
        last up to seven days. The browser-identity cookie lasts for the browser
        session. Clearing cookies signs you out and may remove access to a guest
        unless you have an available recovery code.
      </p>
      <p>
        Local browser storage remembers your sound preference until you clear
        it. Session storage holds a match-ad marker to avoid repeating an ad
        after a refresh; it ends with the tab session. Blocking essential
        storage may prevent sign-in or multiplayer features from working.
      </p>
      <p>
        When enabled, pregame ads use Google AdSense H5 Games Ads. Google and
        participating third-party vendors may use cookies and similar
        technologies, IP addresses, device information and ad interactions to
        deliver and measure ads. With consent where required, advertising
        cookies can personalize ads based on visits to Mathrix and other sites.
        Vendors and their purposes are identified in the available consent
        message. A Google test ad is still delivered by an external provider.
      </p>
      <p>
        Use{" "}
        <Link href="/settings">Preferences → Privacy and cookie settings</Link>{" "}
        to review or withdraw advertising choices when Google’s controls are
        available. You can also manage personalization in{" "}
        <a href="https://myadcenter.google.com/">Google My Ad Center</a>.
        Refusing personalized advertising does not prevent play; a pregame wait
        may still apply. Reading this policy or using Mathrix is not consent to
        optional advertising cookies. Learn more about{" "}
        <a href="https://policies.google.com/technologies/partner-sites">
          how Google uses information from partner sites
        </a>
        .
      </p>
      <p>
        House ads do not load a third-party ad SDK, but an externally hosted
        campaign image sends a normal image request to its host, including your
        IP address and browser information. Clicking an ad or a community link
        takes you to another service with its own privacy practices. Poppins is
        loaded through Google Fonts, so your browser requests the stylesheet and
        font files from Google.
      </p>

      <h2>6. Providers and international processing</h2>
      <p>
        Hosting and infrastructure providers process data needed to run Mathrix.
        Google and Discord process data when you choose their sign-in options;
        Google also processes advertising data when its advertising services
        load. Stripe processes payments when purchasing is available. Their
        notices explain their own processing:{" "}
        <a href="https://policies.google.com/privacy">Google</a>,{" "}
        <a href="https://discord.com/privacy">Discord</a> and{" "}
        <a href="https://stripe.com/privacy">Stripe</a>.
      </p>
      <p>
        These providers may process information outside Ireland and the European
        Economic Area. Their privacy notices explain their processing locations
        and transfer arrangements. Where we transfer personal data outside the
        EEA, applicable law requires an appropriate transfer mechanism, such as
        a European Commission adequacy decision or standard contractual clauses
        with any necessary additional safeguards. Contact us for details of the
        countries and safeguards relevant to your data or to request a copy of
        applicable safeguards.
      </p>
      <p>
        Information may also be disclosed when required by law or necessary to
        establish or defend legal claims, subject to applicable safeguards.
      </p>

      <h2>7. How long information is kept</h2>
      <p>
        Signing out, closing your browser or canceling Premium does not delete
        account or match records. Accounts, saved guest profiles, match history,
        ratings, house-ad records and billing records currently have no
        automatic age-based deletion schedule. They remain until separately
        removed. Importing a saved guest removes the guest profile and
        invalidates its code while retaining the progress in your new account.
      </p>
      <p>
        Where performance history is collected, aggregate samples are retained
        for 30 days and pruned hourly. Web access logs rotate by file size, so
        their duration varies with traffic. Other operational logs and backups
        follow the host’s configuration.
      </p>
      <p>
        Retention is assessed according to the purpose of each record:
        maintaining your account and game history, investigating security or
        fair-play incidents, resolving disputes, and meeting applicable
        accounting or legal requirements. You can request deletion at the
        contact above. Records no longer needed for those purposes should be
        deleted or anonymized; records subject to a legal retention duty or an
        ongoing claim may need to be retained. A deletion request also needs to
        address identifying information in match events, advertising records and
        backups, not only the account entry. We will explain any applicable
        exceptions when responding to your request.
      </p>

      <h2>8. Your choices and rights</h2>
      <p>
        You can edit supported public details in{" "}
        <Link href="/profile">Profile</Link>, change advertising choices in{" "}
        <Link href="/settings">Preferences</Link>, and clear your browser
        storage. Where applicable law provides, you may request access,
        correction, deletion, restriction or a portable copy of your personal
        data, object to processing based on legitimate interests, and withdraw
        consent without affecting earlier lawful use. Some information may need
        to be kept for a legal obligation or claim.
      </p>
      <p>
        Email <a href="mailto:contact@mathrix.app">contact@mathrix.app</a> to
        exercise your rights. There is currently no self-service
        account-deletion or data-export screen. We may ask for proportionate
        information to verify that the request concerns your data. Never send
        your password or full payment-card details, or post a guest recovery
        code publicly.
      </p>
      <p>
        We respond without undue delay and normally within one month. If a
        legally permitted extension is needed because of the complexity or
        number of requests, we will explain it within that first month. You may
        complain to Ireland’s{" "}
        <a href="https://www.dataprotection.ie/">Data Protection Commission</a>{" "}
        or the supervisory authority where you live or work. The European
        Commission also explains{" "}
        <a href="https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en">
          your data-protection rights
        </a>
        .
      </p>

      <h2>9. Children and security</h2>
      <p>
        Mathrix is intended for people aged 16 or older, subject to any higher
        local age requirement. We do not knowingly seek personal data from
        children under 16. If you believe a child has supplied personal data,
        contact us so we can investigate and take appropriate steps, including
        deletion where required.
      </p>
      <p>
        Mathrix uses HTTPS, hashed passwords, restricted administrator access
        and checks on game actions. No online service can guarantee absolute
        security. Keep sign-in credentials and guest recovery codes private.
      </p>

      <h2>10. Changes to this policy</h2>
      <p>
        Updates will appear on this page with a revised date. Material changes
        will be brought to your attention through the service or another
        appropriate channel, and new consent will be requested where required.
      </p>
    </article>
  );
}
