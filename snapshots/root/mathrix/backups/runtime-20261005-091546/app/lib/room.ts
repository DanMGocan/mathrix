import { event, finishGame, tickGame, type Game } from "./engine";
export class Room {
  disconnectedAt: (number | null)[] = [null, null];
  readyNotBefore = [0, 0];
  readyDeadline: number;
  waitForAdCompletion = false;
  persisted = false;
  retryAt = 0;
  constructor(
    public game: Game,
    maxWaitMs = 15000,
  ) {
    this.readyDeadline = game.reservedAt + maxWaitMs;
  }
  ready(player: number, now: number) {
    if (this.game.ready[player]) return;
    if (this.game.status !== "pregame" || now < this.readyNotBefore[player])
      throw Error("Advertisement still running");
    this.game.ready[player] = true;
    this.beginCountdown(now);
  }
  beginCountdown(now: number) {
    if (this.game.ready.every(Boolean) && this.game.status === "pregame") {
      this.game.status = "countdown";
      this.game.startedAt = now + 3000;
      this.game.seq++;
      event(this.game, "COUNTDOWN", {}, now);
    }
  }
  disconnect(player: number, now: number) {
    this.disconnectedAt[player] = now;
    event(this.game, "DISCONNECT", { player }, now);
  }
  reconnect(player: number, now: number) {
    this.disconnectedAt[player] = null;
    event(this.game, "RECONNECT", { player }, now);
  }
  tick(now: number) {
    if (this.game.status === "finished") return null;
    const expired = this.disconnectedAt.findIndex(
      (t) => t !== null && now - t >= this.game.config.reconnectMs,
    );
    if (expired >= 0) {
      if (this.game.status === "pregame" && this.waitForAdCompletion)
        return "pregame_cancelled";
      finishGame(this.game, now, "disconnect", expired);
      return "disconnect";
    }
    if (this.game.status === "pregame" && now >= this.readyDeadline) {
      if (this.waitForAdCompletion) return "pregame_cancelled";
      if (now < Math.max(...this.readyNotBefore)) return null;
      this.game.ready = [true, true];
      this.beginCountdown(now);
      return "ad_timeout";
    }
    return tickGame(this.game, now);
  }
}
