import type { Plugin } from "@opencode/plugin";
import type { PluginConfig } from "./types";
import type { SessionStateStore } from "./session-state";

type Ctx = Plugin.Context;
// Branded Session.ID, derived without a named import.
type SessionID = Parameters<Ctx["session"]["wait"]>[0]["sessionID"];

export function createIdleHandler(args: {
  ctx: Ctx;
  getConfig: () => Promise<PluginConfig>;
  sessionStateStore: SessionStateStore;
}): (sessionID: SessionID) => Promise<void> {
  const { ctx, getConfig, sessionStateStore } = args;

  async function injectContinuation(sessionID: SessionID): Promise<void> {
    const config = await getConfig();
    if (!config.enabled) return;

    const state = sessionStateStore.getState(sessionID);
    if (state.inFlight) return;
    if (state.consecutiveCount >= config.max_consecutive) return;

    state.inFlight = true;
    try {
      // v2 prompt uses the session's current agent/model; no need to resolve them anymore.
      await ctx.session.prompt({ sessionID, text: config.message });
      state.consecutiveCount += 1;
      state.lastInjectedAt = Date.now();
    } catch {
      // swallow transport errors; opencode logs them
    } finally {
      state.inFlight = false;
    }
  }

  return async function onIdle(sessionID: SessionID): Promise<void> {
    const config = await getConfig();
    if (!config.enabled) return;

    const state = sessionStateStore.getState(sessionID);

    if (state.deferredTimer) {
      clearTimeout(state.deferredTimer);
      state.deferredTimer = undefined;
    }

    if (state.lastInjectedAt && Date.now() - state.lastInjectedAt < config.cooldown_ms) {
      const remaining = config.cooldown_ms - (Date.now() - state.lastInjectedAt);
      state.deferredTimer = setTimeout(() => {
        state.deferredTimer = undefined;
        void injectContinuation(sessionID);
      }, remaining);
      return;
    }

    await injectContinuation(sessionID);
  };
}
