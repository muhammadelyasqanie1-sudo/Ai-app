import assert from "node:assert/strict";
import { authCopy, coreCopy, resolveCoreLocale } from "../src/utils/coreCopy.ts";

const coreEnglish = coreCopy("english");
const authEnglish = authCopy("english");

for (const language of ["dari", "pashto", "persian", "arabic"] as const) {
  const core = coreCopy(language);
  const auth = authCopy(language);
  assert.deepEqual(Object.keys(core).sort(), Object.keys(coreEnglish).sort(), `${language} core keys`);
  assert.deepEqual(Object.keys(auth).sort(), Object.keys(authEnglish).sort(), `${language} auth keys`);
  assert.ok(Object.values(core).every((value) => value.trim().length > 0), `${language} core values`);
  assert.ok(Object.values(auth).every((value) => value.trim().length > 0), `${language} auth values`);
}

assert.equal(resolveCoreLocale("turkish"), "english");
assert.equal(resolveCoreLocale("pashto"), "pashto");
assert.equal(coreCopy("urdu").retry, "Retry");
console.log("AFG core copy: shell/auth key parity, reviewed values and fallback passed.");
