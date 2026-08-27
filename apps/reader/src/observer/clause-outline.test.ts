import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hoistOutlineH4s,
  partitionRootsByOutlineStanding,
  type OutlineHoistStanding
} from "./outline-hoist.ts";

type Node = { finiteVerbId: string; children: Node[] };

test("Keep nested parks an incoming root; hoist does not lift it back", () => {
  const standing: Record<string, OutlineHoistStanding> = {
    "2:20:2": "h4",
    "2:20:15": "dependent",
    "2:20:17": "dependent"
  };
  const standingOf = (id: string) => standing[id] ?? "dependent";
  const working: Node[] = [
    { finiteVerbId: "2:20:2", children: [] },
    { finiteVerbId: "2:20:15", children: [] },
    { finiteVerbId: "2:20:17", children: [] }
  ];
  const { units, nested } = partitionRootsByOutlineStanding(working, standingOf);
  assert.deepEqual(
    units.map(n => n.finiteVerbId),
    ["2:20:2"]
  );
  assert.deepEqual(
    nested.map(n => n.finiteVerbId),
    ["2:20:15", "2:20:17"]
  );
  const hoisted = hoistOutlineH4s(units, standingOf);
  assert.deepEqual(
    hoisted.map(n => n.finiteVerbId),
    ["2:20:2"]
  );
});

test("hoist still lifts a dependent child that the operator marked H4", () => {
  const standingOf = (id: string): OutlineHoistStanding => (id === "12:12:3" ? "h4" : "dependent");
  const roots: Node[] = [
    {
      finiteVerbId: "12:12:1",
      children: [{ finiteVerbId: "12:12:3", children: [] }]
    }
  ];
  const hoisted = hoistOutlineH4s(roots, standingOf);
  assert.deepEqual(
    hoisted.map(n => n.finiteVerbId),
    ["12:12:1", "12:12:3"]
  );
  assert.equal(hoisted[0].children.length, 0);
});
