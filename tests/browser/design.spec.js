import { test, expect } from "@playwright/test";
import { Chess } from "chess.js";
import { DEFAULT_SETTINGS, newSession, gameResult } from "../../src/chess.js";

const viewports = [
  { width: 1440, height: 1000 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
];
async function inspectType(page) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const loaded = [...document.fonts].filter(
      (face) =>
        /^Inter(?: Variable)?$/.test(face.family.replace(/["']/g, "")) &&
        face.status === "loaded",
    );
    const wrong = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const element = node.parentElement;
      if (
        !element ||
        element.closest("svg,script,style") ||
        !element.getClientRects().length
      )
        continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (!/^['"]?Inter(?: Variable)?['"]?(?:,|$)/.test(style.fontFamily))
        wrong.push({
          text: node.textContent.trim().slice(0, 60),
          font: style.fontFamily,
        });
    }
    return { loaded: loaded.length, wrong };
  });
}
async function contrastFailures(page, scope = "body") {
  return page.locator(scope).evaluate((root) => {
    function parse(value) {
      const m = value.match(/[\d.]+/g)?.map(Number);
      return m && m.length >= 3 ? [m[0], m[1], m[2], m[3] ?? 1] : [0, 0, 0, 0];
    }
    function over(front, back) {
      const a = front[3] + back[3] * (1 - front[3]);
      return [0, 1, 2]
        .map(
          (i) =>
            (front[i] * front[3] + back[i] * back[3] * (1 - front[3])) /
            (a || 1),
        )
        .concat(a);
    }
    function background(element) {
      const chain = [];
      for (let el = element; el; el = el.parentElement) chain.push(el);
      let color = [255, 255, 255, 1];
      for (const el of chain.reverse())
        color = over(parse(getComputedStyle(el).backgroundColor), color);
      return color;
    }
    function luminance(color) {
      const linear = color.slice(0, 3).map((v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    }
    const failures = [],
      seen = new Set(),
      walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.textContent.trim()) continue;
      const el = node.parentElement;
      if (
        !el ||
        seen.has(el) ||
        el.closest('svg,script,style,button:disabled,[aria-disabled="true"]') ||
        !el.getClientRects().length
      )
        continue;
      seen.add(el);
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const bg = background(el),
        fg = over(parse(style.color), bg),
        a = luminance(bg),
        b = luminance(fg),
        ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        size = parseFloat(style.fontSize),
        large =
          size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700),
        required = large ? 3 : 4.5;
      if (ratio + 0.01 < required)
        failures.push({
          text: node.textContent.trim().slice(0, 50),
          color: style.color,
          background: bg.slice(0, 3),
          ratio: Number(ratio.toFixed(2)),
          required,
        });
    }
    return failures;
  });
}
for (const viewport of viewports)
  test(`editorial layout and loaded Inter at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("");
    await expect(page.locator(".square")).toHaveCount(64);
    const type = await inspectType(page);
    expect(
      type.loaded,
      "Inter must be loaded, not only named in a fallback stack",
    ).toBeGreaterThan(0);
    expect(type.wrong).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const board = await page.locator(".board").boundingBox();
    expect(board.width).toBeGreaterThanOrEqual(
      Math.min(viewport.width - 48, 400),
    );
    expect(Math.abs(board.width - board.height)).toBeLessThan(2);
    if (viewport.width >= 1024)
      expect(board.y + board.height).toBeLessThanOrEqual(viewport.height);
    const clocks = page.locator(".clock");
    await expect(clocks).toHaveCount(2);
    for (const clock of await clocks.all()) {
      const box = await clock.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
      const style = await clock.evaluate((el) => ({
        fontSize: parseFloat(getComputedStyle(el).fontSize),
        numbers: getComputedStyle(el).fontVariantNumeric,
      }));
      expect(style.fontSize).toBeGreaterThanOrEqual(24);
      expect(style.numbers).toContain("tabular-nums");
      if (viewport.width >= 1024)
        expect(box.x).toBeGreaterThan(board.x + board.width);
    }
    expect(await contrastFailures(page)).toEqual([]);
    await page.screenshot({
      path: `test-results/design-${viewport.width}.png`,
      fullPage: true,
    });
  });
test("editorial dialogs use loaded Inter, readable contrast and keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("");
  await page.keyboard.press("Tab");
  const focus = await page.locator(":focus").evaluate((el) => ({
    width: parseFloat(getComputedStyle(el).outlineWidth),
    style: getComputedStyle(el).outlineStyle,
  }));
  expect(focus.width).toBeGreaterThanOrEqual(2);
  expect(focus.style).not.toBe("none");
  await page.getByRole("button", { name: "New game" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await inspectType(page)).wrong).toEqual([]);
  expect(await contrastFailures(page, "[role=dialog]")).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/design-new-game-320.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Import game", exact: false }).click();
  expect((await inspectType(page)).wrong).toEqual([]);
  expect(await contrastFailures(page, "[role=dialog]")).toEqual([]);
  await page.screenshot({
    path: "test-results/design-import-320.png",
    fullPage: false,
  });
});
test("editorial promotion selector stays readable at narrow mobile width", async ({
  page,
}) => {
  const session = {
    ...newSession({
      ...DEFAULT_SETTINGS,
      time: "Untimed",
      sound: false,
      undo: true,
    }),
    startFen: "1r2k3/P6p/8/8/8/8/7P/4K3 w - - 0 1",
  };
  await page.addInitScript(
    (s) =>
      localStorage.setItem(
        "quiet-knight-v1",
        JSON.stringify({ version: 1, session: s }),
      ),
    session,
  );
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("");
  await page.getByRole("button", { name: /Start playing/ }).click();
  await page.locator("[data-square=a7]").click();
  await page.locator("[data-square=b8]").click();
  await expect(
    page.getByRole("dialog", { name: "Choose promotion" }),
  ).toBeVisible();
  expect((await inspectType(page)).wrong).toEqual([]);
  expect(await contrastFailures(page, "[role=dialog]")).toEqual([]);
  const dialog = await page.getByRole("dialog").boundingBox();
  expect(dialog.x).toBeGreaterThanOrEqual(0);
  expect(dialog.x + dialog.width).toBeLessThanOrEqual(320);
  for (const name of ["queen", "rook", "bishop", "knight"])
    await expect(
      page.getByRole("button", { name: `Promote to ${name}` }),
    ).toBeVisible();
  await page.screenshot({
    path: "test-results/design-promotion-320.png",
    fullPage: false,
  });
});
test("editorial review labels and graph remain readable on desktop and mobile", async ({
  page,
}) => {
  const game = new Chess();
  game.loadPgn("1. f3 e5 2. g4 Qh4#");
  const session = {
    ...newSession({ ...DEFAULT_SETTINGS, time: "Untimed", sound: false }),
    pgn: game.pgn(),
    result: gameResult(game),
  };
  await page.addInitScript(
    (s) =>
      localStorage.setItem(
        "quiet-knight-v1",
        JSON.stringify({ version: 1, session: s }),
      ),
    session,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("");
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Analyze game", exact: true }).click();
  await expect(page.locator(".review-row")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Analyze again" }),
  ).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    expect((await inspectType(page)).wrong).toEqual([]);
    expect(await contrastFailures(page)).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/design-review-${width}.png`,
      fullPage: true,
    });
  }
});
test("Inter remains available after an offline reload without HTTP cache", async ({
  page,
  context,
}) => {
  await page.goto("");
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.clearBrowserCache");
  await cdp.detach();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".square")).toHaveCount(64);
  const type = await inspectType(page);
  expect(type.loaded).toBeGreaterThan(0);
  expect(type.wrong).toEqual([]);
  await context.setOffline(false);
});
test("legal move and capture markers contrast against both square tones", async ({
  page,
}) => {
  const session = {
    ...newSession({ ...DEFAULT_SETTINGS, time: "Untimed", sound: false }),
    startFen: "7k/8/3p4/4P3/8/8/8/7K w - - 0 1",
  };
  await page.addInitScript(
    (s) =>
      localStorage.setItem(
        "quiet-knight-v1",
        JSON.stringify({ version: 1, session: s }),
      ),
    session,
  );
  await page.goto("");
  await page.getByRole("button", { name: /Start playing/ }).click();
  await page.locator("[data-square=e5]").click();
  const ratios = await page.locator(".legal").evaluateAll((nodes) => {
    const rgb = (value) =>
        value
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number),
      lum = (c) => {
        const a = c.map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      };
    return nodes.map((el) => {
      const style = getComputedStyle(el),
        bg = rgb(getComputedStyle(el.closest(".square")).backgroundColor),
        fg = rgb(
          el.classList.contains("capture")
            ? style.borderTopColor
            : style.backgroundColor,
        ),
        opacity = Number(style.opacity),
        blended = fg.map((v, i) => v * opacity + bg[i] * (1 - opacity)),
        a = lum(bg),
        b = lum(blended);
      return {
        square: el.closest(".square").dataset.square,
        capture: el.classList.contains("capture"),
        ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
  });
  expect(ratios.some((r) => r.capture)).toBe(true);
  expect(ratios.some((r) => !r.capture)).toBe(true);
  for (const marker of ratios)
    expect(marker.ratio, JSON.stringify(marker)).toBeGreaterThanOrEqual(3);
  await page.keyboard.press("Tab");
  await page.locator("[data-square=a1]").focus();
  const focus = await page.locator("[data-square=a1]").evaluate((el) => {
    const s = getComputedStyle(el),
      rgb = (v) =>
        v
          .match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number),
      lum = (c) => {
        const a = c.map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      },
      ratio = (a, b) =>
        (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05),
      bg = rgb(s.backgroundColor),
      outline = rgb(s.outlineColor),
      shadow = rgb(s.boxShadow);
    return {
      width: parseFloat(s.outlineWidth),
      ratio: ratio(outline, bg),
      halo: shadow ? Math.min(ratio(outline, shadow), ratio(shadow, bg)) : 0,
    };
  });
  expect(focus.width).toBeGreaterThanOrEqual(2);
  expect(Math.max(focus.ratio, focus.halo)).toBeGreaterThanOrEqual(3);
});
test("headings clocks and button labels render in Inter without glyph fallback", async ({
  page,
  context,
}) => {
  const session = newSession({
    ...DEFAULT_SETTINGS,
    time: "Untimed",
    sound: false,
  });
  await page.addInitScript(
    (s) =>
      localStorage.setItem(
        "quiet-knight-v1",
        JSON.stringify({ version: 1, session: s }),
      ),
    session,
  );
  await page.goto("");
  await page.evaluate(() => document.fonts.ready);
  const cdp = await context.newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const evidence = [];
  for (const selector of [
    "h1",
    ".brand",
    ".clock",
    ".intro .primary",
    ".resume",
    ".file-actions button:first-child",
    ".file-actions button:last-child",
    ".brand span:last-child",
    ".brand small",
    ".text-button",
    ".board-caption",
    ".board-bottom",
    ".local-badge",
    ".quiet-note p",
    "footer",
  ]) {
    const { nodeId } = await cdp.send("DOM.querySelector", {
      nodeId: root.nodeId,
      selector,
    });
    expect(nodeId, `Missing font-audit element: ${selector}`).toBeGreaterThan(
      0,
    );
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    evidence.push({ selector, fonts });
    for (const font of fonts.filter((f) => f.glyphCount > 0))
      expect
        .soft(font.familyName, JSON.stringify({ selector, fonts }))
        .toMatch(/^Inter/);
  }
  console.log("Rendered font evidence:", JSON.stringify(evidence));
  await cdp.detach();
});
