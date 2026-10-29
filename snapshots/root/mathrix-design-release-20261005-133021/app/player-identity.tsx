import {
  avatarURL,
  countryFlag,
  countryName,
  type PlayerAppearance,
} from "@/lib/profile";

export default function PlayerIdentity({
  player,
}: {
  player: PlayerAppearance & { name: string };
}) {
  const location = [
    player.city,
    player.countryCode && countryName(player.countryCode),
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <span className={`player-identity${player.premium ? " is-premium" : ""}`}>
      <img
        className="player-avatar"
        src={avatarURL(player.avatarId)}
        alt=""
        width={48}
        height={48}
      />
      <span className="player-details">
        <span className="player-name">{player.name}</span>
        {player.premium && (
          <span
            className="premium-badge"
            aria-label="Premium player"
            title="Premium player"
          >
            ✦
          </span>
        )}
        {location && (
          <small className="player-location">
            {player.countryCode && (
              <span aria-hidden="true">{countryFlag(player.countryCode)} </span>
            )}
            {location}
          </small>
        )}
      </span>
    </span>
  );
}
