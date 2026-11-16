import { Plugin } from "@opencode/plugin";
import { loadConfig } from "./config.js";
import { createSessionStateStore } from "./session-state.js";
import { createIdleHandler } from "./idle-handler.js";
import type { PluginConfig } from "./types.js";

const serviceName = "opencode-auto-continue";

export default Plugin.define({
  id: serviceName,
  setup: async (ctx) => {
    // opencode 2 runs setup once per working directory, so this is the session's directory.
    const directory = ctx.location.directory;
    const sessionStateStore = createSessionStateStore();

    // Config comes from <directory>/.opencode/auto-continue.json(c), with opencode.jsonc plugin
    // options (ctx.options) overriding the file when present.
    const getConfig = async (): Promise<PluginConfig> => {
      const base = loadConfig([directory]);
      const o = ctx.options as Partial<PluginConfig> | undefined;
      if (!o || typeof o !== "object") return base;
      return {
        enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled,
        message: typeof o.message === "string" ? o.message : base.message,
        cooldown_ms: typeof o.cooldown_ms === "number" ? o.cooldown_ms : base.cooldown_ms,
        max_consecutive:
          typeof o.max_consecutive === "number" ? o.max_consecutive : base.max_consecutive,
      };
    };

    const onIdle = createIdleHandler({ ctx, getConfig, sessionStateStore });

    const abort = new AbortController();

    // opencode 2 does not push session.idle to plugin event subscribers, so idle is detected with
    // session.wait(), armed whenever a prompt (user or auto-continue) starts a turn.
    const waiting = new Set<string>();
    const armWait = (sessionID: Parameters<typeof onIdle>[0]): void => {
      const key = String(sessionID);
      if (waiting.has(key)) return;
      waiting.add(key);
      void (async () => {
        try {
          await new Promise((r) => setTimeout(r, 1000)); // let the agent loop start first
          if (abort.signal.aborted) return;
          await ctx.session.wait({ sessionID });
        } catch (err) {
          console.error(`[${serviceName}] wait error: ${String(err)}`);
          return;
        } finally {
          waiting.delete(key);
        }
        try {
          await onIdle(sessionID);
        } catch (err) {
          console.error(`[${serviceName}] idle handler error: ${String(err)}`);
        }
      })();
    };

    ctx.session.hook("prompt", async (event) => {
      const state = sessionStateStore.getState(event.sessionID);
      // A prompt we did not send is a real user message: restart the consecutive count.
      if (!state.inFlight) sessionStateStore.resetConsecutive(event.sessionID);
      armWait(event.sessionID);
    });

    return () => abort.abort();
  },
});
