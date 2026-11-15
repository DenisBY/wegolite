// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors
import { describe, expect, it } from "vitest";
import { allowsChordKey, createInputState } from "../../src/input/keyboard";

const plain = { ctrlKey: false, metaKey: false, altKey: false };

describe("allowsChordKey (WR-01)", () => {
  it("lets a plain key through", () => {
    expect(allowsChordKey({ code: "KeyA", ...plain }, false)).toBe(true);
  });

  it("lets a bound flight key through while only Ctrl is held", () => {
    expect(
      allowsChordKey({ code: "KeyA", ...plain, ctrlKey: true }, true),
    ).toBe(true);
  });

  it("keeps an unbound or non-flight Ctrl chord with the browser", () => {
    expect(
      allowsChordKey({ code: "KeyZ", ...plain, ctrlKey: true }, false),
    ).toBe(false);
  });

  it("never turns a Meta or Alt chord into game input", () => {
    expect(
      allowsChordKey({ code: "KeyA", ...plain, metaKey: true }, true),
    ).toBe(false);
    expect(allowsChordKey({ code: "KeyA", ...plain, altKey: true }, true)).toBe(
      false,
    );
    expect(
      allowsChordKey(
        { code: "KeyA", ...plain, ctrlKey: true, altKey: true },
        true,
      ),
    ).toBe(false);
  });

  it("always allows the Control key itself", () => {
    expect(
      allowsChordKey({ code: "ControlLeft", ...plain, ctrlKey: true }, false),
    ).toBe(true);
  });

  it("fires on A while precision (Ctrl) is already held", () => {
    const state = createInputState();
    state.keyDown("ControlLeft");
    expect(state.keyDown("KeyA")).toBe(true);
    expect(state.frame().fire).toBe(true);
    expect(state.frame().precision).toBe(true);
  });
});
