import type { Plugin } from "@opencode/plugin";
import type { PluginConfig } from "./types";
import type { SessionStateStore } from "./session-state";

type Ctx = Plugin.Context;
// Branded Session.ID, derived without a named import.
type SessionID = Parameters<Ctx["session"]["context"]>[0]["sessionID"];

// opencode v2 session messages are a discriminated union keyed by `type`; we only need the
// assistant message id (for dedup) and user message text (to detect a real follow-up).
type LooseMessage = { type: string; id?: string; text?: string };

function lastAssistantMessageId(messages: readonly LooseMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.type === "assistant") return m.id;
  }
  return undefined;
}

function hasRealUserMessageAfterLastContinue(
  messages: readonly LooseMessage[],
  continueText: string,
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.type !== "user") continue;
    const text = (m.text ?? "").trim().toLowerCase();
    return text !== continueText.toLowerCase();
  }
  return false;
}

export function createIdleHandler(args: {
  ctx: Ctx;
  getConfig: (sessionID: SessionID) => Promise<PluginConfig>;
  sessionStateStore: SessionStateStore;
}): (sessionID: SessionID) => Promise<void> {
  const { ctx, getConfig, sessionStateStore } = args;

  async function injectContinuation(sessionID: SessionID): Promise<void> {
    const config = await getConfig(sessionID);
    if (!config.enabled) return;

    const state = sessionStateStore.getState(sessionID);
    if (state.inFlight) return;
    if (state.consecutiveCount >= config.max_consecutive) return;

    let messages: readonly LooseMessage[];
    try {
      messages = (await ctx.session.context({ sessionID })) as unknown as readonly LooseMessage[];
    } catch {
      return;
    }

    const assistantId = lastAssistantMessageId(messages);
    if (!assistantId) return;
    if (state.lastAssistantMessageId === assistantId) return;

    if (hasRealUserMessageAfterLastContinue(messages, config.message)) {
      sessionStateStore.resetConsecutive(sessionID);
    }
    if (state.consecutiveCount >= config.max_consecutive) return;

    state.inFlight = true;
    try {
      // v2 prompt uses the session's current agent/model; no need to resolve them anymore.
      await ctx.session.prompt({ sessionID, text: config.message });
      state.lastAssistantMessageId = assistantId;
      state.consecutiveCount += 1;
      state.lastInjectedAt = Date.now();
    } catch {
      // swallow transport errors; opencode logs them
    } finally {
      state.inFlight = false;
    }
  }

  return async function onIdle(sessionID: SessionID): Promise<void> {
    const config = await getConfig(sessionID);
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
