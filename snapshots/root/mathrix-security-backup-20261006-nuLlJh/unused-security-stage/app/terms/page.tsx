import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Mathrix",
  description:
    "Rules for Mathrix accounts, fair play, advertising and Premium subscriptions.",
};

export default function Terms() {
  return (
    <article className="page prose legal-page">
      <h1>Terms of Service</h1>
      <p className="muted">Effective date: 5 October 2026</p>
      <p>
        These terms cover Mathrix at mathrix.app, including the game, accounts
        and paid features where available. By using Mathrix, you agree to these
        terms. If you do not agree, do not use the service. The{" "}
        <Link href="/privacy">Privacy Policy</Link> explains how personal data
        is handled; accepting terms is not consent to optional advertising.
      </p>

      <h2>1. Operator and eligibility</h2>
      <p>
        Mathrix is provided by <strong>Blouticelli Games Limited</strong>,
        Ireland. “Mathrix”, “we”, “us” and “our” refer to that company.
      </p>
      <p>
        Postal address: 11, College Court, Portobello, Dublin, Ireland.
        <br />
        Support, complaints and billing:{" "}
        <a href="mailto:contact@mathrix.app">contact@mathrix.app</a>.
      </p>
      <p>
        You must be at least 16 and meet any higher minimum age required where
        you live. If you are not legally able to enter this agreement yourself,
        a parent or legal guardian must authorize your use and any purchase. Use
        Mathrix only where doing so is lawful.
      </p>

      <h2>2. Accounts and guest access</h2>
      <p>
        Provide accurate account information and use a name you are entitled to
        use. Keep your password and any guest recovery code confidential. You
        are responsible for activity you authorize and for reasonable steps to
        protect your account. Tell us if you believe someone has accessed it
        without permission. Do not sell accounts, impersonate someone else or
        use another person’s account without authorization.
      </p>
      <p>
        Guest access depends on your browser session. Where a recovery code is
        provided, save it privately; losing both the session and code may mean
        we cannot restore access. Where offered, importing guest progress is
        available during new-account creation and invalidates the old guest
        code. It is not a general account-merging service.
      </p>

      <h2>3. Playing fairly</h2>
      <p>
        Follow the <Link href="/how-to-play">game rules</Link> and instructions
        shown for your chosen mode. The game server validates online moves and
        results. Timers, missed turns, disconnects and forfeits can affect your
        outcome. Ratings and statistics are game records, have no cash value and
        are not a promise of prizes or earnings.
      </p>
      <ul>
        <li>
          Do not cheat, collude, manipulate ratings or automate competitive play
          with unauthorized bots or scripts.
        </li>
        <li>
          Do not exploit bugs, bypass access controls, overload the service or
          interfere with another player’s connection.
        </li>
        <li>
          Do not harass others, publish unlawful or hateful profile content,
          impersonate staff or disclose another person’s private information.
        </li>
        <li>
          Do not misuse payment systems, advertising or recovery codes, or
          collect other players’ data without a lawful basis.
        </li>
      </ul>
      <p>
        We may investigate suspected abuse and correct affected results. Any
        restriction will be proportionate to the conduct and subject to your
        applicable legal rights.
      </p>

      <h2>4. Advertising and third-party services</h2>
      <p>
        Free play may include house campaigns, Google ads and a pregame wait. An
        ad may be unavailable or blocked without removing the wait. You are
        never required to click an ad or consent to personalized ads to play.
        Third-party sign-in, advertising, payment pages and community links are
        provided by their respective operators and may have their own terms. An
        advertisement is not a guarantee or endorsement of its offer.
      </p>

      <h2>5. Premium subscriptions, when available</h2>
      <p>
        Premium is an optional subscription for registered accounts. The current
        offer is €4.99 per month, including applicable taxes in that displayed
        price. Confirm the price, billing interval and included features at
        checkout before paying. Stripe processes payments. Purchasing is
        unavailable until payment services are configured.
      </p>
      <p>
        A subscription renews monthly and your selected payment method is
        charged until you cancel. Premium starts when payment is confirmed;
        payment processing may cause a short delay. Failed renewals do not
        extend the period already paid for.
      </p>
      <p>
        Premium provides the cosmetics shown in the offer and removes pregame
        ads for your account. It does not improve game rules, scores or ratings.
        You may still wait for a free opponent to finish their pregame phase.
        Premium applies to the subscribed account, not every account or browser
        on a device.
      </p>
      <p>
        Use <Link href="/profile">Profile → Manage subscription</Link> to open
        Stripe’s billing portal and cancel renewal. Cancellation normally takes
        effect at the end of the paid billing period; the portal shows the
        effective date. Signing out, clearing cookies or stopping play does not
        cancel a subscription. Contact the operator if the portal is
        unavailable.
      </p>
      <p>
        Canceling renewal does not by itself refund the current period. This
        does not limit rights to withdrawal, refunds or remedies required by
        law, including for a defective or unavailable paid service.
      </p>
      <p>
        If you are an Irish or EU consumer, you normally have 14 days from
        entering the initial subscription contract to withdraw without giving a
        reason. Email{" "}
        <a href="mailto:contact@mathrix.app">contact@mathrix.app</a> or write to
        our postal address before the period expires, clearly stating your
        decision and identifying your account and purchase. You may use this
        wording, but do not have to: “I give notice that I withdraw from my
        Mathrix Premium subscription, ordered on [date], for account [email]. My
        name and address are [details].” Include the date and, for a paper
        request, your signature.
      </p>
      <p>
        We will refund amounts due without undue delay and within 14 days of
        receiving your withdrawal, using the original payment method unless
        otherwise agreed, without a refund fee. A proportionate charge for
        services already supplied applies only where lawfully permitted and you
        expressly requested service during the cooling-off period. Merely using
        Premium does not waive your statutory rights. This does not shorten any
        longer cancellation period the law provides. Read Ireland’s
        <a href="https://www.ccpc.ie/consumer-advice/consumer-rights/buying-goods/buying-online">
          {" "}
          guidance on online cancellation rights
        </a>
        .
      </p>
      <p>
        Any future price change will be communicated in advance, apply only to a
        future billing period and give you an opportunity to cancel before it
        applies. Additional agreement will be sought where the law requires.
      </p>

      <h2>6. Content and ownership</h2>
      <p>
        Mathrix and its licensors retain their rights in the software, branding,
        artwork and other service content. You receive permission to use the
        service for your personal entertainment under these terms. This does not
        transfer ownership or override rights granted by applicable law or a
        separate open-source or asset license.
      </p>
      <p>
        You retain rights in content you provide, such as your chosen profile
        details. You give us permission to store, display and process that
        content only as needed to operate the service and the features you use.
        You must have the rights needed to supply it. Personal-data processing
        is described in the Privacy Policy.
      </p>

      <h2>7. Availability and changes to the game</h2>
      <p>
        Mathrix may change rules, balance, features or technical requirements
        and may be interrupted for maintenance, faults or events outside our
        reasonable control. We do not promise uninterrupted play, a particular
        rating or permanent availability of every free feature. Development
        versions may reset progress. These statements do not remove our
        obligations for paid services or your statutory remedies.
      </p>
      <p>
        If a change materially reduces an ongoing paid service, we will provide
        the notice and cancellation or refund rights required by applicable law.
      </p>

      <h2>8. Suspension and ending use</h2>
      <p>
        You may stop using Mathrix at any time. Cancel recurring payments
        separately and request account deletion by emailing contact@mathrix.app,
        as described in the Privacy Policy. Stopping play does not automatically
        erase stored records.
      </p>
      <p>
        We may restrict or suspend access for a material breach, suspected
        compromise, fraud or a legal requirement. Where practical and lawful, we
        will explain the reason and give you a way to challenge the decision.
        Urgent action may be needed to protect the service or other players.
        Suspension does not remove mandatory consumer or refund rights.
      </p>

      <h2>9. Responsibility and disputes</h2>
      <p>
        You are responsible for your device, internet connection and lawful use
        of Mathrix. To the extent permitted by law, we are not responsible for
        losses caused solely by your connection or device, or by an independent
        third-party service outside our control. We remain responsible where
        applicable law makes us responsible.
      </p>
      <p>
        Nothing in these terms excludes liability for fraud, deliberate
        misconduct, death or personal injury caused by negligence, or any other
        liability that cannot lawfully be excluded. Nothing limits mandatory
        consumer protections, digital-service guarantees or access to courts.
      </p>
      <p>
        Contact <a href="mailto:contact@mathrix.app">contact@mathrix.app</a>{" "}
        first so we can investigate a complaint. These terms are governed by
        Irish law. If you are a consumer, this choice does not deprive you of
        mandatory protections under the law of the country where you habitually
        live. Irish courts have non-exclusive jurisdiction; you retain any right
        to bring a claim in the courts of your country of residence. These terms
        do not require arbitration or waive collective remedies provided by law.
      </p>

      <h2>10. Updates to these terms</h2>
      <p>
        Changes will be posted here with their effective date and material
        changes brought to your attention with reasonable advance notice, unless
        an urgent legal or security change requires otherwise. Changes will not
        retrospectively remove accrued rights. Where required, we will seek your
        agreement before applying new terms. If one provision is unenforceable,
        the remaining provisions continue to apply to the extent allowed by law.
      </p>
    </article>
  );
}
