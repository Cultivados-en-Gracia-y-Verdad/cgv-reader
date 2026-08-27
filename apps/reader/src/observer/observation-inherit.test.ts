import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeInheritedObservation } from "./observation-inherit.ts";

test("Keep nested survives coordinate inheritance of a content parent", () => {
  const merged = mergeInheritedObservation(
    {
      describesNoun: "no",
      isWhatWasExpressed: "yes",
      expressedParentClauseId: "2:20:6",
      tellsWhenOrIf: "no",
      outlineStanding: "dependent"
    },
    {
      isWhatWasExpressed: "yes",
      expressedParentClauseId: "2:20:2"
    }
  );
  assert.equal(merged.outlineStanding, "dependent");
  assert.equal(merged.expressedParentClauseId, "2:20:2");
});
