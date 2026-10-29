import type { Metadata } from "next";
import Link from "next/link";
import { isAdministrator } from "@/lib/admin-access";

export const metadata: Metadata = {
  title: "Audit | Mathrix Admin",
  description:
    "The 6 October 2026 review of Mathrix gameplay, usability, commercial potential and Google advertising readiness.",
};

export default async function Audit() {
  if (!(await isAdministrator())) return null;
  return (
    <article className="page prose legal-page">
      <Link href="/admin">← Admin dashboard</Link>
      <h1>Audit</h1>
      <p className="muted">
        Mathrix · <time dateTime="2026-10-06">6 October 2026</time>
      </p>
      <p>
        <strong>
          Mathrix has a clever competitive core and credible niche potential.
        </strong>{" "}
        It is ready for a small human testing cohort. Broad appeal, repeat
        engagement, profitable acquisition and Google monetization readiness
        remain unproven. This is a dated snapshot, not live metrics or a
        description of later releases.
      </p>

      <nav className="actions" aria-label="Audit sections">
        <a href="#verdict">Verdict</a>
        <a href="#gameplay">Gameplay</a>
        <a href="#experience">Experience</a>
        <a href="#commercial">Commercial potential</a>
        <a href="#advertising">Google advertising</a>
        <a href="#priorities">Priorities</a>
        <a href="#opinion">Robotico opinion</a>
        <a href="#method">Evidence</a>
      </nav>

      <h2 id="verdict">Provisional verdict</h2>
      <div
        className="table-wrap"
        role="region"
        aria-label="Provisional ratings"
        tabIndex={0}
      >
        <table style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col">Assessment</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Fun for number and puzzle fans</td>
              <td>6–7 / 10</td>
            </tr>
            <tr>
              <td>Concept interest</td>
              <td>8 / 10</td>
            </tr>
            <tr>
              <td>Aesthetics</td>
              <td>6.5 / 10</td>
            </tr>
            <tr>
              <td>Commercial outlook</td>
              <td>Promising niche; unproven</td>
            </tr>
            <tr>
              <td>Google monetization</td>
              <td>Verification needed</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        These are editorial judgments, not measured satisfaction or approval
        probabilities. General-audience enjoyment may be lower while learning
        friction remains high.
      </p>

      <h2 id="gameplay">Gameplay, interest and fairness</h2>
      <p>
        Two positive 2×2 boards start at a signed sum of 10. Players compete for
        the higher sum at the deadline, using four shared cards that can grow to
        eight. Default matches last two minutes; turn limits shrink from six to
        three seconds. The reviewed pool contains 56 operation types.
      </p>
      <ul>
        <li>
          <strong>Shared choices create tactical tension:</strong> improve your
          board, sabotage an opponent or consume the card they wanted. Both
          complete boards and legal targets remain visible.
        </li>
        <li>
          <strong>Negative values enable clever reversals:</strong> negation,
          absolute value and roots turn arithmetic into an interactive contest.
        </li>
        <li>
          <strong>Skipping trades tempo for resources:</strong> with four cards,
          it replaces two and grants two destroyed tiles, plus two to each power
          limit. Cumulative destroyed totals determine future growth cells and
          are never spent.
        </li>
        <li>
          <strong>Protection, growth and clocks add decisions:</strong> protect
          valuable lines, preserve a square board for determinants or shorten
          the match when ahead. Fresh pools, opponents and private rooms support
          replayability.
        </li>
      </ul>
      <p>
        <strong>Opening equality is incomplete.</strong> Boards are
        independently generated and the first player is random. Both [5, 3; 1,
        1] and [3, 3; 2, 2] total 10, but factorial offers gains of 115 versus
        3. This verifies opening luck, not its overall win-rate effect.
      </p>
      <p>
        <strong>Late swings deserve testing.</strong> Negating an opponent row
        [1,000, 1,000] removes 4,000 points; an absolute-value reply restores
        them. The deadline guarantees neither a final reply nor equal turns.
        Counterplay depends on available cards and time.
      </p>
      <p>
        The shared, visible i value ranges from 1 to 50. Under Mathrix’s special
        root rule, −100 becomes 500 at i = 50, but 10 at i = 1. Explain this
        fictional substitution clearly, especially in educational promotion.
        Repeated skips, growth and these different tactical regimes need human
        balance testing.
      </p>
      <p>
        Standard AI uses one-move score evaluation with modest growth,
        protection and clock considerations. It sees no future draws, plans no
        opponent reply and does not deliberately skip for resources. Practice
        makes random legal moves. Both support access and exploration; lasting
        solo challenge needs stronger progression. The observed Early, Mid and
        Late weights were identical, matching bundled defaults; distinct phases
        depend on deliberate tuning.
      </p>
      <p>
        Tactical variety is substantial. Whether it produces lasting strategic
        depth and retention remains a question for experienced human players.
      </p>

      <h3>The reviewed release and pending changes</h3>
      <div
        className="table-wrap"
        role="region"
        aria-label="Live versus pending release snapshot"
        tabIndex={0}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col">Live during review</th>
              <th scope="col">Pending development</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Starting limits</td>
              <td>Square 0; Cube 0</td>
              <td>Square 2; Cube 1</td>
            </tr>
            <tr>
              <td>Growth</td>
              <td>Self-only</td>
              <td>Either matrix, using the acting player’s destroyed total</td>
            </tr>
            <tr>
              <td>Mobile and cards</td>
              <td>Stacked boards; landscape cards</td>
              <td>Side-by-side boards; revised portrait cards and controls</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Live gameplay stayed unchanged during review. Pending improvements were
        not assessed as deployed; later releases need separate validation.
      </p>

      <h2 id="experience">Player experience</h2>
      <p>
        The custom logo, pastel ownership colors, explicit labels and scope
        arrows create a clean, friendly mathematical tabletop identity. Desktop
        showed all four starting cards clearly. Contextual help, highlighted
        targets, keyboard shortcuts, Shift and Escape are useful strengths. The
        interface has limited dramatic action feedback.
      </p>
      <p>
        <strong>The first session is the largest opportunity.</strong> The
        landing page gives little explanation beyond its logo and entry choices.
        The long mobile lobby presents Ranked, four Casual speeds, four AI
        speeds and rooms before Practice. Put safe learning within easy reach.
      </p>
      <p>
        The tutorial is dense reference material. Players juggle cards, two
        boards, two clocks, signed scores, i, growth and power limits without
        outcome previews. The captured Practice opening had two absolute-value
        cards that changed nothing on positive boards, plus a boost awaiting a
        future payoff. A guided attack and counter would teach faster.
      </p>
      <p>
        <strong>Mobile card visibility is a verified risk.</strong> At 390
        pixels, one complete card and part of the next were visible; inspecting
        alternatives required swiping under time pressure. There was no
        page-wide horizontal overflow. Stacked boards and the persistent footer
        reduced decision space. Important secondary text was small; full 5×5
        targeting still needs validation.
      </p>
      <p>
        Explain the last operation, target and score change. Results need a
        useful learning takeaway. Curiosity and comeback peaks can otherwise
        give way to overload or an unexplained final loss. Online help keeps
        clocks running; Practice pauses AI during help but protection still
        expires. Make those consequences clear.
      </p>

      <h2 id="commercial">Commercial potential</h2>
      <p>
        Number, puzzle and quick-strategy fans are the most plausible initial
        audience. Shared cards and dramatic reversals give demonstrations a
        distinctive hook. A loyal small community is credible; mass-market
        success is unproven. Empty observed queues strengthen the case for
        prominent AI, Practice and friend-room paths before relying on ranked
        matchmaking. One Ranked and four Casual queues divide a small audience.
      </p>
      <p>
        Before the review match, the inspected snapshot contained zero completed
        saved matches with start events, match participants and billing records.
        The review added one automated AI match, which is test activity rather
        than organic demand. These counts do not exclude visits, local Practice
        or activity before resets. No retention or revenue forecast is
        justified.
      </p>
      <p>
        Premium offers cosmetics and removal of your own ads for €4.99/month.
        Subscribers still wait for a free opponent’s ad, weakening the
        convenience benefit. Deployed Stripe keys, webhook configuration and
        price were absent, so working billing was unverified. Ad fill, revenue,
        subscription conversion and costs were not established. Frequent pregame
        advertising must earn its place through repeat play. Validate
        completion, rematches, returns and actual economics before scaling paid
        acquisition.
      </p>

      <h2 id="advertising">Google advertising readiness</h2>
      <p>
        <strong>Prepared in parts; verification is still needed.</strong> This
        covers publisher revenue through AdSense/H5, not buying Google Ads
        traffic. Google alone confirms approval.
      </p>
      <ul>
        <li>
          <strong>Working foundations:</strong> public pages and health checks
          were available; a timed AI match completed and saved. Live ads.txt
          matched the configured publisher ID, which does not establish
          approval.
        </li>
        <li>
          <strong>Observed ads:</strong> HOUSE_ADS, enabled pregame, every
          eligible match, no cooldown. Test mode was prepared as true. H5 stayed
          inactive; no Google test/live ads, SDK/CMP loading or ad network
          requests were observed in that flow. Prepared integration code
          supports pregame placement and audio/consent callbacks; its external
          runtime remained unverified.
        </li>
        <li>
          <strong>Unverified account states:</strong> AdSense approval, site
          readiness, H5 eligibility and CMP publication. Unverified does not
          mean absent, rejected or approved. Check dashboards and exercise the
          intended external-provider and consent flow.
        </li>
        <li>
          <strong>Legal foundations:</strong> substantial live Privacy and Terms
          pages identified the operator/contact and covered GDPR, cookies,
          advertising and Premium. Keep notices consistent with launched flows.
        </li>
        <li>
          <strong>Submission risk:</strong> the original working game is a
          strength; the sparse homepage needs explanatory content and clear
          learning/navigation. This is a review risk, not certain rejection. A
          prepared test flag or house-ad wait does not verify Google delivery.
        </li>
      </ul>
      <p>Check the current official guidance before submission:</p>
      <ul>
        <li>
          <a href="https://support.google.com/adsense/answer/7299563?hl=en">
            Original content and navigation
          </a>
        </li>
        <li>
          <a href="https://support.google.com/adsense/answer/12131223?hl=en">
            Site readiness and ownership
          </a>
        </li>
        <li>
          <a href="https://support.google.com/adsense/answer/1705831?hl=en&ref_topic=9960293">
            H5 account requirements
          </a>
        </li>
        <li>
          <a href="https://developers.google.com/ad-placement/docs/test">
            Test ads and restrictions
          </a>
        </li>
        <li>
          <a href="https://support.google.com/admanager/answer/13554116">
            Consent management requirements
          </a>
        </li>
        <li>
          <a href="https://support.google.com/adsense/answer/1348695">
            Required privacy disclosures
          </a>
        </li>
      </ul>

      <h2 id="priorities">Priorities</h2>
      <ol>
        <li>
          <strong>Improve activation:</strong> explain the hook, highlight
          Practice/AI and guide a satisfying first attack and response.
        </li>
        <li>
          <strong>Validate mobile:</strong> compare cards quickly, preserve
          readable values and test full boards under three-second turns.
        </li>
        <li>
          <strong>Test balance:</strong> opening composition, first-player
          outcomes, skips, growth, i, stage tuning and unanswered final moves.
        </li>
        <li>
          <strong>Verify launch operations:</strong> check Google
          approval/consent, ads and billing. Two seeded administrator records
          existed in the reviewed snapshot; passwords were not tested.
          Deployment notes now record their removal. Verify that only intended
          administrators retain access.
        </li>
        <li>
          <strong>Recruit roughly 30–50 relevant players:</strong> a practical
          initial cohort, not an industry benchmark or conclusive sample. Agree
          criteria first; observe unaided completion, questions, rematches,
          returns, mobile mis-taps, waits and perceived fairness.
        </li>
      </ol>

      <h2 id="opinion">My robotico-personal opinion</h2>
      <p>
        I like Mathrix when numbers become weapons and a clever reversal changes
        the match. The shared deck and resource-building skip give it character.
        My reservation is the effort a newcomer spends decoding moves instead of
        enjoying them. I would preserve the core, make the first minute easier
        and the consequences clearer, then let returning human players determine
        whether it deserves a larger launch.
      </p>

      <h2 id="method">Evidence and limits</h2>
      <p>
        Independent gameplay/interface assessment, fresh automated
        desktop/mobile captures, deployed rules/configuration, official Google
        guidance and executed engine scenarios informed this review. Engine and
        AI test files passed. Historical captures conflicting with the reviewed
        release were excluded.
      </p>
      <p>
        One automated timed AI session logged 134 move attempts and saved a
        clock result of 537 versus 10,039, including a 10,000 bot cell. It chose
        first legal cards/targets, with no observed browser, page or request
        errors. This checks the flow; it does not compare skill or fairness.
        Automation and tests do not prove human enjoyment, long-term balance,
        profitability, all-device accessibility or Google approval. No
        real-player matchmaking, password testing or paid transaction supplied
        evidence.
      </p>
      <div className="actions">
        <Link className="button" href="/admin">
          Back to dashboard
        </Link>
        <Link href="/admin/docs">Game documentation</Link>
        <Link href="/how-to-play">Player tutorial</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/terms">Terms of Service</Link>
      </div>
    </article>
  );
}
