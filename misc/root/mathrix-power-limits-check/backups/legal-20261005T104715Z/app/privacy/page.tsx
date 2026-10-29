export default function Privacy() {
  return (
    <section className="page prose">
      <div className="eyebrow">PRIVACY NOTICE</div>
      <h1>Your data, plainly.</h1>
      <p>
        Mathrix stores necessary account details, secure sessions, match results
        and event logs to run the game. Passwords are hashed with the
        authentication library’s scrypt implementation. Google/Discord sign-in
        stores provider identifiers and credentials needed for sign-in.
      </p>
      <p>
        Guest sessions use an HTTP-only cookie and a temporary Redis record that
        expires after 24 hours. Guests have no permanent profile or leaderboard
        position; completed matches retain a temporary display name and game
        events for integrity.
      </p>
      <p>
        A necessary browser-session cookie prevents duplicate tabs or account
        changes from matching you against yourself.
      </p>
      <p>
        House campaigns record impressions and clicks with a session/player
        identifier to avoid duplicate counts. Opening a campaign link takes you
        to another site governed by its privacy policy.
      </p>
      <p>
        Pregame advertising uses Google AdSense H5 Games Ads. Google may use
        cookies, device information and advertising data to serve ads, subject
        to your consent choices where required. Google test ads are labeled and
        do not generate revenue. Live ad requests wait for Google’s consent
        message to resolve; declining consent does not prevent you from playing.
      </p>
      <p>
        You can change your choices in Preferences using Privacy and cookie
        settings. Sound preferences and a per-match ad marker are stored
        locally. Google pregame placements include a waiting period, including
        when ads are blocked or unavailable. Both players wait for any displayed
        ad to finish before the game clock starts.
      </p>
      <h2>Before a public production launch</h2>
      <p>
        The operator must add its legal identity, contact and deletion-request
        channel, retention periods, processor agreements, and a
        consent-management platform appropriate to the chosen ad provider. This
        prototype notice is not a claim of legal compliance.
      </p>
      <p>
        Administrators can inspect registered user profiles and match history,
        suspend accounts, and change game settings. Secrets and password hashes
        are not exposed through the admin API.
      </p>
    </section>
  );
}
