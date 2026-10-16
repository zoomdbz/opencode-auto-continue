import { Plugin } from "@opencode/plugin";
import { loadConfig } from "./config.js";
import { createSessionStateStore } from "./session-state.js";
import { createIdleHandler } from "./idle-handler.js";
import type { PluginConfig } from "./types.js";

const serviceName = "opencode-auto-continue";

export default Plugin.define({
  id: serviceName,
  setup: async (ctx) => {
    const directory = ctx.location.directory;
    const sessionStateStore = createSessionStateStore();

    // Config comes from <project>/.opencode/auto-continue.json(c), with opencode.jsonc plugin
    // options (ctx.options) overriding the file when present.
    const getConfig = (): PluginConfig => {
      const base = loadConfig(directory);
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
    void (async () => {
      try {
        for await (const ev of ctx.event.subscribe({ signal: abort.signal })) {
          if (ev.type === "session.deleted") {
            sessionStateStore.cleanup(ev.data.sessionID);
          } else if (ev.type === "session.idle") {
            await onIdle(ev.data.sessionID);
          }
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error(`[${serviceName}] event subscription error: ${String(err)}`);
        }
      }
    })();

    return () => abort.abort();
  },
});
