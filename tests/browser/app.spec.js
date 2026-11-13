import { test, expect } from "@playwright/test";
async function setup(page, { side = "w", undo = true, time = "Untimed" } = {}) {
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByLabel("Play as").selectOption(side);
  await page.getByLabel("Time control").selectOption(time);
  await page.getByLabel("Allow undo").setChecked(undo);
  await page.getByRole("button", { name: "Let’s play" }).click();
}
async function move(page, from, to) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}
async function importGame(page, text) {
  await page
    .getByRole("button", { name: "Import game", exact: false })
    .first()
    .click();
  await page.getByLabel("PGN or FEN", { exact: true }).fill(text);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import game", exact: true })
    .click();
}
const saved = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("quiet-knight-v1")).session,
  );
test("real browser engine, paired undo, save and resume", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("");
  await setup(page);
  await move(page, "e2", "e4");
  await expect.poll(async () => (await saved(page)).snapshots.length).toBe(2);
  await page.getByRole("button", { name: "Undo", exact: false }).click();
  await expect.poll(async () => (await saved(page)).snapshots.length).toBe(0);
  await move(page, "d2", "d4");
  await expect.poll(async () => (await saved(page)).snapshots.length).toBe(2);
  const before = (await saved(page)).pgn;
  await page.reload();
  await expect(page.getByRole("button", { name: /Resume game/ })).toBeVisible();
  expect((await saved(page)).pgn).toBe(before);
  expect(errors).toEqual([]);
});
test("black orientation and desktop drag", async ({ page }) => {
  await page.goto("");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await setup(page, { side: "b" });
  await expect(page.locator(".square").first()).toHaveAttribute(
    "data-square",
    "h1",
  );
  await expect.poll(async () => (await saved(page)).snapshots.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "Undo", exact: false }),
  ).toBeDisabled();
  const a = await page.locator('[data-square="e7"]').boundingBox(),
    b = await page.locator('[data-square="e5"]').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await saved(page)).snapshots.length)
    .toBeGreaterThanOrEqual(2);
});
test("promotion, completed game, replay, review and play from position", async ({
  page,
}) => {
  await page.goto("");
  await importGame(page, "7k/P7/6K1/8/8/8/8/8 w - - 0 1");
  await page.getByRole("button", { name: /Start playing/ }).click();
  await move(page, "a7", "a8");
  await expect(
    page.getByRole("dialog", { name: "Choose promotion" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Promote to queen" }).click();
  await expect.poll(async () => (await saved(page)).pgn).toContain("a8=Q");
  await importGame(page, "1. f3 e5 2. g4 Qh4#");
  await expect(page.getByRole("status").first()).toContainText(
    "Black wins by checkmate",
  );
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("button", { name: "Analyze game", exact: true }).click();
  await expect(page.locator(".review-row")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Analyze again" }),
  ).toBeVisible();
  await expect(page.locator(".review-row").last()).toContainText(
    "Mate for Black",
  );
  await page.getByRole("button", { name: "First position" }).click();
  await page.getByRole("button", { name: "Play from here" }).click();
  await page.getByRole("button", { name: "Play from this position" }).click();
  expect((await saved(page)).pgn).toBe("");
});
test("clock increment, pause and invalid import", async ({ page }) => {
  await page.goto("");
  await setup(page, { time: "3 + 2" });
  await page.waitForTimeout(700);
  await move(page, "e2", "e4");
  await expect.poll(async () => (await saved(page)).snapshots.length).toBe(2);
  const s = await saved(page);
  expect(s.clocks.w).toBeGreaterThan(180000);
  expect(s.clocks.b).toBeGreaterThan(179000);
  await page.getByRole("button", { name: "Pause", exact: false }).click();
  const clock = (await saved(page)).clocks.w;
  await page.waitForTimeout(500);
  expect((await saved(page)).clocks.w).toBe(clock);
  await page
    .getByRole("button", { name: "Import game", exact: false })
    .first()
    .click();
  await page.getByLabel("PGN or FEN", { exact: true }).fill("not a chess game");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import game", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Import failed",
  );
});
test("mobile touch moves, layout and offline engine", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("");
  await setup(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /Start playing/ }).tap();
  await page.locator("[data-square=e2]").tap();
  await page.locator("[data-square=e4]").tap();
  await expect.poll(async () => (await saved(page)).snapshots.length).toBe(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await context.setOffline(false);
});
test("desktop layout and static release assets", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("");
  await expect(page.locator(".square")).toHaveCount(64);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  for (const path of [
    "engine/stockfish-19-lite-single.wasm",
    "engine/stockfish-source.tar.gz",
    "licenses/Stockfish-GPL-3.0.txt",
    "manifest.webmanifest",
    "icon-192.png",
    "apple-touch-icon.png",
    "favicon.ico",
  ])
    expect((await request.get(path)).ok()).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /apple-touch-icon\.png$/,
  );
});

test("touch drag and legal bot response", async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("");
  await setup(page);
  const a = await page.locator('[data-square="d2"]').boundingBox(),
    b = await page.locator('[data-square="d4"]').boundingBox(),
    cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: a.x + a.width / 2, y: a.y + a.height / 2 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect.poll(async () => (await saved(page)).snapshots.length).toBe(2);
});

test("touch hints, evaluation and keyboard modal dismissal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("");
  await setup(page);
  await page.getByRole("button", { name: "Hint", exact: false }).tap();
  await expect(page.locator(".note")).toContainText("Try");
  await page.getByLabel("Show engine evaluation", { exact: false }).check();
  await expect(page.locator(".eval-bar")).not.toHaveAttribute(
    "aria-label",
    "Evaluation loading",
  );
  await page.getByRole("button", { name: "Mute sound" }).click();
  await setup(page);
  await expect(page.getByRole("button", { name: "Enable sound" })).toHaveText(
    "Muted",
  );
  await expect(
    page.getByLabel("Show engine evaluation", { exact: false }),
  ).toBeChecked();
  await page.getByRole("button", { name: "New game" }).tap();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
