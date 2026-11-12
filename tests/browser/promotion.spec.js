import { test, expect } from "@playwright/test";
import { Chess } from "chess.js";
import { DEFAULT_SETTINGS, newSession, fromSession } from "../../src/chess.js";
const names = { q: "queen", r: "rook", b: "bishop", n: "knight" };
const fixtures = {
  w: {
    fen: "1r2k3/P6p/8/8/8/8/7P/4K3 w - - 0 1",
    from: "a7",
    quiet: "a8",
    capture: "b8",
  },
  b: {
    fen: "4k3/7p/8/8/8/8/p6P/1R2K3 b - - 0 1",
    from: "a2",
    quiet: "a1",
    capture: "b1",
  },
};
async function seed(page, color, mobile = false, settings = {}) {
  const f = fixtures[color],
    session = {
      ...newSession({
        ...DEFAULT_SETTINGS,
        side: color,
        time: "Untimed",
        undo: true,
        sound: false,
        delay: 1400,
        ...settings,
      }),
      startFen: f.fen,
    };
  await page.setViewportSize(
    mobile ? { width: 390, height: 844 } : { width: 1440, height: 1100 },
  );
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "quiet-knight-v1",
        JSON.stringify({ version: 1, session: value }),
      ),
    session,
  );
  await page.goto("");
  await page.getByRole("button", { name: /Start playing/ }).click();
  return f;
}
const read = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("quiet-knight-v1")).session,
  );
async function drag(page, from, to, touch = false) {
  const source = page.locator(`[data-square=${from}]`),
    target = page.locator(`[data-square=${to}]`);
  await source.scrollIntoViewIfNeeded();
  const a = await source.boundingBox(),
    b = await target.boundingBox();
  const start = { x: a.x + a.width / 2, y: a.y + a.height / 2 },
    end = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  if (touch) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    for (let i = 1; i <= 8; i++)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * i) / 8,
            y: start.y + ((end.y - start.y) * i) / 8,
          },
        ],
      });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    return cdp;
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up();
  }
}
async function complete(page, f, color, piece, capture, mode) {
  const target = capture ? f.capture : f.quiet;
  let touchSession = null;
  if (mode === "click") {
    await page.locator(`[data-square=${f.from}]`).click();
    await page.locator(`[data-square=${target}]`).click();
  } else if (mode === "tap") {
    await page.locator(`[data-square=${f.from}]`).tap();
    await page.locator(`[data-square=${target}]`).tap();
  } else touchSession = await drag(page, f.from, target, mode === "touch-drag");
  const dialog = page.getByRole("dialog", { name: "Choose promotion" });
  await expect(dialog).toBeVisible();
  for (const name of Object.values(names))
    await expect(
      dialog.getByRole("button", { name: `Promote to ${name}` }),
    ).toBeVisible();
  const pending = await read(page);
  expect(fromSession(pending).fen()).toBe(f.fen);
  expect(pending.snapshots).toHaveLength(0);
  expect(fromSession(pending).get(f.from)?.type).toBe("p");
  const choice = dialog.getByRole("button", {
    name: `Promote to ${names[piece]}`,
  });
  if (touchSession) {
    const box = await choice.boundingBox();
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
    });
    await touchSession.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await touchSession.detach();
  } else if (mode === "tap") await choice.tap();
  else await choice.click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(async () => fromSession(await read(page)).history().length)
    .toBeGreaterThanOrEqual(1);
  const promoted = fromSession(await read(page)).history({ verbose: true })[0];
  expect(promoted).toMatchObject({
    from: f.from,
    to: target,
    color,
    promotion: piece,
  });
  expect(promoted.captured).toBe(capture ? "r" : undefined);
  expect(new Chess(promoted.after).get(target)).toMatchObject({
    color,
    type: piece,
  });
  await expect(page.locator(".move-list")).toContainText(
    `=${piece.toUpperCase()}`,
  );
  await expect
    .poll(async () => fromSession(await read(page)).history().length)
    .toBe(2);
  const replied = await read(page),
    history = fromSession(replied).history({ verbose: true });
  expect(history[1].color).toBe(color === "w" ? "b" : "w");
  const replay = new Chess(f.fen);
  for (const move of history)
    expect(
      replay.move({
        from: move.from,
        to: move.to,
        ...(move.promotion ? { promotion: move.promotion } : {}),
      }),
    ).toBeTruthy();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: false }).click();
  const restored = await read(page);
  expect(fromSession(restored).fen()).toBe(f.fen);
  expect(restored.snapshots).toHaveLength(0);
  await expect(page.locator(".move-row")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Your turn");
}
for (const color of ["w", "b"])
  for (const capture of [false, true])
    for (const mode of ["click", "drag"])
      for (const piece of ["q", "r", "b", "n"])
        test(`promotion ${color} ${capture ? "capture" : "quiet"} ${mode} ${names[piece]}`, async ({
          page,
        }) => {
          const f = await seed(page, color);
          await complete(page, f, color, piece, capture, mode);
        });
for (const color of ["w", "b"])
  for (const mode of ["tap", "touch-drag"])
    test(`mobile promotion ${color} capture ${mode} knight`, async ({
      page,
    }) => {
      const f = await seed(page, color, true);
      await complete(page, f, color, "n", true, mode);
    });
test("pending promotion resumes after hidden-tab pause without charging paused time", async ({
  page,
}) => {
  const f = await seed(page, "w", false, { time: "3 + 2" });
  await page.locator("[data-square=a7]").click();
  await page.locator("[data-square=b8]").click();
  await expect(
    page.getByRole("dialog", { name: "Choose promotion" }),
  ).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const pausedClock = (await read(page)).clocks.w;
  await page.waitForTimeout(450);
  expect((await read(page)).clocks.w).toBe(pausedClock);
  await page.getByRole("button", { name: "Promote to knight" }).click();
  await expect(
    page.getByRole("dialog", { name: "Choose promotion" }),
  ).toHaveCount(0);
  await expect
    .poll(async () => fromSession(await read(page)).history().length)
    .toBe(2);
  const move = fromSession(await read(page)).history({ verbose: true })[0];
  expect(move).toMatchObject({ from: f.from, to: f.capture, promotion: "n" });
  const resumed = await read(page);
  expect(resumed.snapshots[0].w).toBeGreaterThan(pausedClock - 100);
  expect(resumed.snapshots[1].w).toBeGreaterThan(pausedClock + 1900);
});
test("timeout closes pending promotion and preserves uncommitted pawn", async ({
  page,
}) => {
  const f = fixtures.w,
    session = {
      ...newSession({
        ...DEFAULT_SETTINGS,
        side: "w",
        time: "3 min",
        undo: true,
        sound: false,
        delay: 1400,
      }),
      startFen: f.fen,
      clocks: { w: 2500, b: 180000 },
    };
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "quiet-knight-v1",
        JSON.stringify({ version: 1, session: value }),
      ),
    session,
  );
  await page.goto("");
  await page.getByRole("button", { name: /Start playing/ }).click();
  await page.locator("[data-square=a7]").click();
  await page.locator("[data-square=b8]").click();
  await expect(
    page.getByRole("dialog", { name: "Choose promotion" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Black wins on time");
  await expect(
    page.getByRole("dialog", { name: "Choose promotion" }),
  ).toHaveCount(0);
  expect(fromSession(await read(page)).fen()).toBe(f.fen);
  expect((await read(page)).snapshots).toHaveLength(0);
});

test("promotion choice rejects moved-out and cancelled touch gestures", async ({
  page,
}) => {
  const f = await seed(page, "w", true);
  await page.locator("[data-square=a7]").tap();
  await page.locator("[data-square=b8]").tap();
  const choice = page.getByRole("button", { name: "Promote to knight" }),
    box = await choice.boundingBox(),
    point = { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: box.right ?? box.x + box.width + 25, y: point.y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(
    page.getByRole("dialog", { name: "Choose promotion" }),
  ).toBeVisible();
  expect(fromSession(await read(page)).fen()).toBe(f.fen);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await expect(
    page.getByRole("dialog", { name: "Choose promotion" }),
  ).toBeVisible();
  expect(fromSession(await read(page)).fen()).toBe(f.fen);
  await cdp.detach();
});
for (const key of ["Enter", "Space"])
  test(`promotion choice supports keyboard ${key}`, async ({ page }) => {
    const f = await seed(page, "b");
    await page.locator("[data-square=a2]").click();
    await page.locator("[data-square=b1]").click();
    const choice = page.getByRole("button", { name: "Promote to bishop" });
    await choice.focus();
    await page.keyboard.press(key);
    await expect(
      page.getByRole("dialog", { name: "Choose promotion" }),
    ).toHaveCount(0);
    await expect
      .poll(async () => fromSession(await read(page)).history().length)
      .toBe(2);
    expect(
      fromSession(await read(page)).history({ verbose: true })[0],
    ).toMatchObject({ from: f.from, to: f.capture, promotion: "b" });
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
test("promotion choice consumes a following compatibility click exactly once", async ({
  page,
}) => {
  await seed(page, "w");
  await page.locator("[data-square=a7]").click();
  await page.locator("[data-square=b8]").click();
  await page
    .getByRole("button", { name: "Promote to knight" })
    .evaluate((node) => {
      const box = node.getBoundingClientRect(),
        args = {
          bubbles: true,
          pointerId: 42,
          pointerType: "touch",
          clientX: box.x + box.width / 2,
          clientY: box.y + box.height / 2,
        };
      node.dispatchEvent(new PointerEvent("pointerdown", args));
      node.dispatchEvent(new PointerEvent("pointerup", args));
      node.click();
    });
  await expect(
    page.getByRole("dialog", { name: "Choose promotion" }),
  ).toHaveCount(0);
  await expect
    .poll(async () => fromSession(await read(page)).history().length)
    .toBe(2);
  const history = fromSession(await read(page)).history({ verbose: true });
  expect(history.filter((move) => move.color === "w")).toHaveLength(1);
  expect(history[0].promotion).toBe("n");
  await expect(page.getByRole("alert")).toHaveCount(0);
});
