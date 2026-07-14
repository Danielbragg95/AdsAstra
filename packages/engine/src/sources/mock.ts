import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Mock mode: run the entire pipeline offline with fixtures + canned LLM. */
export function isMock(): boolean {
  if (process.env.SIGNALWORK_MOCK === "1") return true;
  if (process.env.SIGNALWORK_MOCK === "0") return false;
  // default to mock when no API key is configured, so `npm run seed` just works
  return !process.env.ANTHROPIC_API_KEY;
}

export function fixturePath(name: string): string {
  return resolve(here, "../../fixtures", name);
}
