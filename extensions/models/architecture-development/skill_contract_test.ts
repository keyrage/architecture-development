import { assertIncludes } from "./_test/assert.ts";

const skill = await Deno.readTextFile(new URL("../../../.claude/skills/architecture-review/SKILL.md", import.meta.url));
Deno.test("skill contract describes selected-only, complete and read-only behavior", () => {
  assertIncludes(skill, "any non-empty subset");
  assertIncludes(skill, "all folder, element, and relationship pages");
  assertIncludes(skill, "Never mutate");
  assertIncludes(skill, "global top ten");
});
