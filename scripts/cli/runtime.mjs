import { resolve } from 'node:path';
import { exitJsonError, jsonMode } from './core.mjs';
import { readAgentYaml } from './yaml.mjs';

// Two vocabularies meet here and nowhere else. The `runtime:` yaml scalar and
// the published `runtimeProvider` field say claude_code; the `--agent` token
// and the internal RUNTIMES set say claude-code. Map at this boundary so
// neither form leaks into the other.
const PROVIDER_BY_TOKEN = { 'claude-code': 'claude_code', codex: 'codex' };
const TOKEN_BY_PROVIDER = { claude_code: 'claude-code', codex: 'codex' };

/** The provider of an agent that never declared one is claude_code. */
const DEFAULT_RUNTIME_PROVIDER = 'claude_code';

export function toRuntimeProvider(token) {
  return PROVIDER_BY_TOKEN[token];
}

export function toRuntimeToken(provider) {
  return TOKEN_BY_PROVIDER[provider];
}

// Reporting a runtime and resolving one are different questions. This answers
// the reporting one and never exits: an unsupported scalar reads as null, which
// is neither claude_code nor codex and so cannot be mistaken for either. A
// roster built on this stays whole when one hand-edited agent.yaml carries a
// typo, and still refuses to name a provider Academy did not resolve.
export function runtimeProviderOrNull(dir) {
  const value = readAgentYaml(dir).runtime;
  if (!value) return DEFAULT_RUNTIME_PROVIDER;
  return TOKEN_BY_PROVIDER[value] ? value : null;
}

// The resolving question, layered on the reporting one. `inspect <name>` and
// `run` both need a runtime they can act on, so an unreadable one is raised
// rather than defaulted: reporting the wrong provider is the defect this
// scalar exists to end.
export function readRuntimeProvider(dir) {
  const provider = runtimeProviderOrNull(dir);
  if (provider) return provider;

  const value = readAgentYaml(dir).runtime;
  const message = `Agent runtime "${value}" is not a runtime Academy supports. Use ${Object.keys(TOKEN_BY_PROVIDER).join(' or ')}.`;
  if (jsonMode()) exitJsonError('invalid_runtime', message, { runtime: value, dir: resolve(dir) });
  console.error(`Error: ${message}`);
  process.exit(1);
}
