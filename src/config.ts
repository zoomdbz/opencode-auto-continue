import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { type PluginConfig, DEFAULT_CONFIG } from "./types"

const CONFIG_FILENAMES = [
  "auto-continue.json",
  "auto-continue.jsonc",
]

function stripJsonComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
}

function findConfigFile(directory: string): string | null {
  for (const filename of CONFIG_FILENAMES) {
    const filePath = join(directory, ".opencode", filename)
    if (existsSync(filePath)) return filePath
  }
  return null
}

function parseConfigFile(filePath: string): Partial<PluginConfig> {
  const raw = readFileSync(filePath, "utf-8")
  const cleaned = stripJsonComments(raw)
  return JSON.parse(cleaned) as Partial<PluginConfig>
}

const warned = new Set<string>()

// First directory in the list with a .opencode/auto-continue.json(c) wins.
export function loadConfig(directories: readonly string[]): PluginConfig {
  let configPath: string | null = null
  for (const directory of directories) {
    configPath = findConfigFile(directory)
    if (configPath) break
  }
  if (!configPath) return { ...DEFAULT_CONFIG }

  try {
    const parsed = parseConfigFile(configPath)
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      message: parsed.message ?? DEFAULT_CONFIG.message,
      cooldown_ms: parsed.cooldown_ms ?? DEFAULT_CONFIG.cooldown_ms,
      max_consecutive: parsed.max_consecutive ?? DEFAULT_CONFIG.max_consecutive,
    }
  } catch (err) {
    if (!warned.has(configPath)) {
      warned.add(configPath)
      console.error(`[opencode-auto-continue] failed to parse ${configPath}: ${String(err)}`)
    }
    return { ...DEFAULT_CONFIG }
  }
}
