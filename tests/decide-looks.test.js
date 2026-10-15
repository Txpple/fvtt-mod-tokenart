import { describe, expect, it } from "vitest";
import {
  FLAG_SCOPE,
  LOOKS,
  PRECEDENCE,
  applicable,
  baseOf,
  isLookOf,
  lookPath,
  lookPaths,
  restoreUpdate,
  splitPath,
  stateOf,
  tokenUpdate,
  winningLook,
  withoutLooks
} from "../scripts/decide/looks.js";

/**
 * DECISION layer: the naming convention and the precedence are exactly what unit tests catch.
 * No Foundry stub on purpose.
 */

describe("splitPath — the file name's extension and the query string", () => {
  it("splits a plain path at the file name's last dot", () => {
    expect(splitPath("assets/tokens/goblin.webp")).toEqual({ stem: "assets/tokens/goblin", ext: ".webp", query: "" });
  });
  it("keeps a query string apart", () => {
    expect(splitPath("https://assets.forge-vtt.com/x/goblin.webp?v=3")).toEqual({
      stem: "https://assets.forge-vtt.com/x/goblin",
      ext: ".webp",
      query: "?v=3"
    });
  });
  it("never takes a dot in a folder name for the extension", () => {
    expect(splitPath("art.v2/goblin")).toEqual({ stem: "art.v2/goblin", ext: "", query: "" });
  });
  it("a dot-file has no extension", () => {
    expect(splitPath("tokens/.goblin")).toEqual({ stem: "tokens/.goblin", ext: "", query: "" });
  });
  it("reads a backslash as a folder separator too", () => {
    expect(splitPath("a.b\\goblin.png")).toEqual({ stem: "a.b\\goblin", ext: ".png", query: "" });
  });
});

describe("lookPath / lookPaths — base → looks, one way", () => {
  it("adds the suffix before the extension, in the same folder", () => {
    expect(lookPath("assets/tokens/goblin.webp", "dead")).toBe("assets/tokens/goblin-dead.webp");
  });
  it("keeps the query string after the extension", () => {
    expect(lookPath("x/goblin.webp?v=3", "prone")).toBe("x/goblin-prone.webp?v=3");
  });
  it("follows video textures the same way", () => {
    expect(lookPath("x/goblin.webm", "combat")).toBe("x/goblin-combat.webm");
  });
  it("takes the table's separator", () => {
    expect(lookPath("goblin.webp", "ready", "_")).toBe("goblin_ready.webp");
    expect(lookPath("goblin.webp", "ready", ".")).toBe("goblin.ready.webp");
  });
  it("a base with no extension still gets its looks", () => {
    expect(lookPath("tokens/goblin", "dead")).toBe("tokens/goblin-dead");
  });
  it("gives every look its path", () => {
    expect(lookPaths("g.webp")).toEqual({
      ready: "g-ready.webp",
      combat: "g-combat.webp",
      prone: "g-prone.webp",
      dead: "g-dead.webp"
    });
    expect(Object.keys(lookPaths("g.webp"))).toEqual([...LOOKS]);
  });
});

describe("isLookOf — which look a path is of a base", () => {
  it("names the look", () => {
    expect(isLookOf("t/goblin-dead.webp", "t/goblin.webp")).toBe("dead");
    expect(isLookOf("t/goblin.combat.webp", "t/goblin.webp", ".")).toBe("combat");
  });
  it("is null for the base itself, another file, or another separator", () => {
    expect(isLookOf("t/goblin.webp", "t/goblin.webp")).toBeNull();
    expect(isLookOf("t/orc-dead.webp", "t/goblin.webp")).toBeNull();
    expect(isLookOf("t/goblin_dead.webp", "t/goblin.webp")).toBeNull();
  });
  it("is exact: the query string counts", () => {
    expect(isLookOf("g-dead.webp?v=2", "g.webp?v=3")).toBeNull();
    expect(isLookOf("g-dead.webp?v=3", "g.webp?v=3")).toBe("dead");
  });
  it("never reads a base out of a look's name", () => {
    expect(isLookOf("walking.webp", "walking-dead.webp")).toBeNull();
    expect(isLookOf("walking-dead-dead.webp", "walking-dead.webp")).toBe("dead");
  });
  it("tolerates junk", () => {
    expect(isLookOf(null, "g.webp")).toBeNull();
    expect(isLookOf("g-dead.webp", undefined)).toBeNull();
    expect(isLookOf("", "")).toBeNull();
  });
});

describe("baseOf — adoption against recognition", () => {
  it("a token never touched: what it wears is its base", () => {
    expect(baseOf({ src: "t/goblin.webp", flags: {} })).toBe("t/goblin.webp");
    expect(baseOf({ src: "t/goblin.webp" })).toBe("t/goblin.webp");
  });
  it("wearing a look of the known base keeps that base", () => {
    expect(baseOf({ src: "t/goblin-prone.webp", flags: { base: "t/goblin.webp", look: "prone" } })).toBe(
      "t/goblin.webp"
    );
  });
  it("a snapshot that hands a look back is a look, not a new base", () => {
    expect(baseOf({ src: "t/owl-prone.webp", flags: { base: "t/owl.webp" } })).toBe("t/owl.webp");
  });
  it("any other image is adopted as the new base", () => {
    expect(baseOf({ src: "t/bear.webp", flags: { base: "t/owl.webp", look: "ready" } })).toBe("t/bear.webp");
  });
  it("a look under another separator is a new base, not a look", () => {
    expect(baseOf({ src: "t/owl_prone.webp", flags: { base: "t/owl.webp" } })).toBe("t/owl_prone.webp");
    expect(baseOf({ src: "t/owl_prone.webp", flags: { base: "t/owl.webp" } }, "_")).toBe("t/owl.webp");
  });
  it("an empty image is an empty base", () => {
    expect(baseOf({ src: "", flags: {} })).toBe("");
    expect(baseOf({ src: null, flags: { base: "t/owl.webp" } })).toBe("");
  });
});

describe("stateOf — one rule for everyone", () => {
  it("dead at 0 Hit Points, or with the dead status", () => {
    expect(stateOf({ hp: 0, statuses: new Set(), inCombat: false }).dead).toBe(true);
    expect(stateOf({ hp: -3, statuses: new Set(), inCombat: false }).dead).toBe(true);
    expect(stateOf({ hp: 12, statuses: new Set(["dead"]), inCombat: false }).dead).toBe(true);
    expect(stateOf({ hp: 12, statuses: new Set(["unconscious"]), inCombat: false }).dead).toBe(false);
  });
  it("no hit points known (another system, a vehicle): not dead by HP", () => {
    expect(stateOf({ hp: null, statuses: new Set(), inCombat: true })).toEqual({
      dead: false,
      prone: false,
      combat: true
    });
    expect(stateOf({ hp: undefined, statuses: null })).toEqual({ dead: false, prone: false, combat: false });
  });
  it("prone from the status, combat from the tracker, statuses as a Set or an array", () => {
    expect(stateOf({ hp: 5, statuses: ["prone"], inCombat: true })).toEqual({ dead: false, prone: true, combat: true });
    expect(stateOf({ hp: 5, statuses: new Set(["prone"]), inCombat: false }).prone).toBe(true);
  });
});

describe("applicable / winningLook — dead > prone > combat > ready > base", () => {
  const all = { ready: true, combat: true, prone: true, dead: true };
  it("the precedence is the one the README states", () => {
    expect([...PRECEDENCE]).toEqual(["dead", "prone", "combat", "ready"]);
  });
  it("lists what a state asks for, strongest first, ready always", () => {
    expect(applicable({ dead: true, prone: true, combat: true })).toEqual(["dead", "prone", "combat", "ready"]);
    expect(applicable({ prone: true })).toEqual(["prone", "ready"]);
    expect(applicable({})).toEqual(["ready"]);
    expect(applicable(null)).toEqual(["ready"]);
  });
  it("a dead creature is dead whatever else is true", () => {
    expect(winningLook({ dead: true, prone: true, combat: true }, all)).toBe("dead");
  });
  it("a prone combatant is prone; a combatant is in combat; anything else is ready", () => {
    expect(winningLook({ prone: true, combat: true }, all)).toBe("prone");
    expect(winningLook({ combat: true }, all)).toBe("combat");
    expect(winningLook({}, all)).toBe("ready");
  });
  it("a missing file falls through to the next look that applies and exists", () => {
    expect(winningLook({ dead: true, combat: true }, { ready: true, combat: true })).toBe("combat");
    expect(winningLook({ combat: true }, { ready: true })).toBe("ready");
    expect(winningLook({ dead: true }, { combat: true })).toBeNull();
  });
  it("no file at all means the base", () => {
    expect(winningLook({ dead: true }, {})).toBeNull();
    expect(winningLook({}, null)).toBeNull();
  });
  it("a look switched off counts as missing", () => {
    expect(winningLook({ dead: true, combat: true }, all, { dead: false })).toBe("combat");
    expect(winningLook({}, all, { ready: false })).toBeNull();
    expect(winningLook({ prone: true }, all, { prone: false, combat: false })).toBe("ready");
  });
  it("takes the available looks as a Set too", () => {
    expect(winningLook({ prone: true }, new Set(["prone"]))).toBe("prone");
    expect(winningLook({ prone: true }, new Set(["ready"]))).toBe("ready");
  });
});

describe("withoutLooks — a wildcard never draws a look file", () => {
  it("drops the look files of the bases in the list", () => {
    expect(
      withoutLooks(["g/goblin-1.webp", "g/goblin-1-dead.webp", "g/goblin-2.webp", "g/goblin-2-prone.webp"])
    ).toEqual(["g/goblin-1.webp", "g/goblin-2.webp"]);
  });
  it("keeps a file whose name merely ends in a look word", () => {
    expect(withoutLooks(["z/walking-dead.webp", "z/zombie.webp"])).toEqual(["z/walking-dead.webp", "z/zombie.webp"]);
    expect(withoutLooks(["z/walking.webp", "z/walking-dead.webp"])).toEqual(["z/walking.webp"]);
  });
  it("honours the separator and keeps the order", () => {
    expect(withoutLooks(["g_2.webp", "g_1.webp", "g_1_dead.webp"], "_")).toEqual(["g_2.webp", "g_1.webp"]);
    expect(withoutLooks(["g_1.webp", "g_1_dead.webp"], "-")).toEqual(["g_1.webp", "g_1_dead.webp"]);
  });
  it("tolerates junk", () => {
    expect(withoutLooks(null)).toEqual([]);
    expect(withoutLooks(["a.webp", 3, undefined])).toEqual(["a.webp"]);
  });
});

describe("tokenUpdate — the write, flat keys, or nothing", () => {
  const B = "t/goblin.webp";
  const flag = key => `flags.${FLAG_SCOPE}.${key}`;

  it("a token at its base the module never touched: nothing", () => {
    expect(tokenUpdate({ id: "a", src: B, flags: {} }, { base: B, look: null })).toBeNull();
  });
  it("putting a look on: the image, the base and the look", () => {
    expect(
      tokenUpdate({ id: "a", src: B, flags: {} }, { base: B, look: "combat", lookSrc: "t/goblin-combat.webp" })
    ).toEqual({
      _id: "a",
      "texture.src": "t/goblin-combat.webp",
      [flag("base")]: B,
      [flag("look")]: "combat"
    });
  });
  it("already wearing it with the right flags: nothing", () => {
    expect(
      tokenUpdate(
        { id: "a", src: "t/goblin-combat.webp", flags: { base: B, look: "combat" } },
        { base: B, look: "combat", lookSrc: "t/goblin-combat.webp" }
      )
    ).toBeNull();
  });
  it("changing looks: the image and the look, the base untouched", () => {
    expect(
      tokenUpdate(
        { id: "a", src: "t/goblin-combat.webp", flags: { base: B, look: "combat" } },
        { base: B, look: "dead", lookSrc: "t/goblin-dead.webp" }
      )
    ).toEqual({ _id: "a", "texture.src": "t/goblin-dead.webp", [flag("look")]: "dead" });
  });
  it("back to base: the image, the look flag removed, the base flag kept", () => {
    expect(
      tokenUpdate({ id: "a", src: "t/goblin-dead.webp", flags: { base: B, look: "dead" } }, { base: B, look: null })
    ).toEqual({
      _id: "a",
      "texture.src": B,
      [flag("-=look")]: null
    });
  });
  it("at base with only a base flag: nothing to write", () => {
    expect(tokenUpdate({ id: "a", src: B, flags: { base: B } }, { base: B, look: null })).toBeNull();
  });
  it("a new base adopted while a look is worn: the base flag follows", () => {
    expect(
      tokenUpdate(
        { id: "a", src: "t/bear.webp", flags: { base: B, look: "ready" } },
        { base: "t/bear.webp", look: "ready", lookSrc: "t/bear-ready.webp" }
      )
    ).toEqual({ _id: "a", "texture.src": "t/bear-ready.webp", [flag("base")]: "t/bear.webp" });
  });
  it("a new base adopted at rest: the stale base flag is corrected, the look flag dropped", () => {
    expect(
      tokenUpdate(
        { id: "a", src: "t/bear.webp", flags: { base: B, look: "ready" } },
        { base: "t/bear.webp", look: null }
      )
    ).toEqual({
      _id: "a",
      [flag("base")]: "t/bear.webp",
      [flag("-=look")]: null
    });
  });
  it("a look with no file of its own falls back to the base image, flags still set", () => {
    expect(tokenUpdate({ id: "a", src: B, flags: {} }, { base: B, look: "ready", lookSrc: null })).toEqual({
      _id: "a",
      [flag("base")]: B,
      [flag("look")]: "ready"
    });
  });
  describe("the dynamic ring's subject", () => {
    const SB = "t/goblin-subject.webp";
    it("swaps with the look when its own look file exists", () => {
      expect(
        tokenUpdate(
          { id: "a", src: B, subject: SB, flags: {} },
          {
            base: B,
            look: "dead",
            lookSrc: "t/goblin-dead.webp",
            subjectBase: SB,
            subjectLookSrc: "t/goblin-subject-dead.webp"
          }
        )
      ).toEqual({
        _id: "a",
        "texture.src": "t/goblin-dead.webp",
        "ring.subject.texture": "t/goblin-subject-dead.webp",
        [flag("base")]: B,
        [flag("look")]: "dead",
        [flag("subject")]: SB
      });
    });
    it("stays at its base when its look file is missing", () => {
      const u = tokenUpdate(
        { id: "a", src: B, subject: SB, flags: {} },
        { base: B, look: "dead", lookSrc: "t/goblin-dead.webp", subjectBase: SB, subjectLookSrc: null }
      );
      expect(u["ring.subject.texture"]).toBeUndefined();
      expect(u[flag("subject")]).toBe(SB);
    });
    it("comes back with the base", () => {
      expect(
        tokenUpdate(
          {
            id: "a",
            src: "t/goblin-dead.webp",
            subject: "t/goblin-subject-dead.webp",
            flags: { base: B, look: "dead", subject: SB }
          },
          { base: B, look: null, subjectBase: SB }
        )
      ).toEqual({ _id: "a", "texture.src": B, "ring.subject.texture": SB, [flag("-=look")]: null });
    });
    it("a token with no subject writes nothing about one", () => {
      const u = tokenUpdate(
        { id: "a", src: B, subject: null, flags: {} },
        { base: B, look: "ready", lookSrc: "t/goblin-ready.webp" }
      );
      expect(Object.keys(u)).toEqual(["_id", "texture.src", flag("base"), flag("look")]);
    });
  });
});

describe("restoreUpdate — back to base and forgotten", () => {
  it("a token the module never touched: nothing", () => {
    expect(restoreUpdate({ id: "a", src: "t/g.webp", flags: {} })).toBeNull();
  });
  it("wearing a look: the base image back and the whole flag scope gone", () => {
    expect(restoreUpdate({ id: "a", src: "t/g-dead.webp", flags: { base: "t/g.webp", look: "dead" } })).toEqual({
      _id: "a",
      "texture.src": "t/g.webp",
      [`flags.-=${FLAG_SCOPE}`]: null
    });
  });
  it("at base with a base flag: only the flags go", () => {
    expect(restoreUpdate({ id: "a", src: "t/g.webp", flags: { base: "t/g.webp" } })).toEqual({
      _id: "a",
      [`flags.-=${FLAG_SCOPE}`]: null
    });
  });
  it("the ring subject comes back too", () => {
    expect(
      restoreUpdate({
        id: "a",
        src: "t/g-dead.webp",
        subject: "t/s-dead.webp",
        flags: { base: "t/g.webp", look: "dead", subject: "t/s.webp" }
      })
    ).toEqual({
      _id: "a",
      "texture.src": "t/g.webp",
      "ring.subject.texture": "t/s.webp",
      [`flags.-=${FLAG_SCOPE}`]: null
    });
  });
});
