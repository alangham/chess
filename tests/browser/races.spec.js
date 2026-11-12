import { test, expect } from "@playwright/test";
const saved = (page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem("quiet-knight-v1")).session,
  );
async function newGame(page) {
  await page.goto("");
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByLabel("Time control").selectOption("Untimed");
  await page.getByLabel("Allow undo").check();
  await page.getByLabel("Bot response pace").selectOption("1400");
  await page.getByRole("button", { name: "Let’s play" }).click();
}
test("undo during bot search and restart reject stale replies", async ({
  page,
}) => {
  await newGame(page);
  await page.locator("[data-square=e2]").click();
  await page.locator("[data-square=e4]").click();
  await page.getByRole("button", { name: "Undo", exact: false }).click();
  await page.waitForTimeout(1700);
  expect((await saved(page)).snapshots).toHaveLength(0);
  await page.locator("[data-square=d2]").click();
  await page.locator("[data-square=d4]").click();
  await page.getByRole("button", { name: "New game" }).click();
  await page.getByRole("button", { name: "Let’s play" }).click();
  await page.waitForTimeout(1700);
  expect((await saved(page)).snapshots).toHaveLength(0);
  await expect(page.getByRole("status")).toContainText("Your turn");
});
test("timeout ends play and PGN export preserves the result", async ({
  page,
}) => {
  await page.goto("");
  await expect(page.locator(".square")).toHaveCount(64);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("quiet-knight-v1"));
    data.session.clocks.w = 150;
    localStorage.setItem("quiet-knight-v1", JSON.stringify(data));
  });
  await page.reload();
  await page.getByRole("button", { name: /Start playing/ }).click();
  await expect(page.getByRole("status")).toContainText("Black wins on time");
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PGN", exact: false }).click();
  const download = await promise;
  const stream = await download.createReadStream();
  let pgn = "";
  for await (const chunk of stream) pgn += chunk.toString();
  expect(pgn).toContain('[Result "0-1"]');
  await page.locator("[data-square=e2]").click();
  await page.locator("[data-square=e4]").click();
  expect((await saved(page)).snapshots).toHaveLength(0);
});
test("custom black-to-move FEN uses its move number and no false captures", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: "Import game", exact: false }).click();
  await page
    .getByLabel("PGN or FEN", { exact: true })
    .fill(
      '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/8/R3K3 b - - 0 42"]\n\n42... Kf7 43. Ra7+',
    );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import game", exact: true })
    .click();
  await expect(page.locator(".move-row").first()).toContainText("42.");
  await expect(page.locator(".move-row").last()).toContainText("43.");
  await expect(page.locator(".captured span")).toHaveCount(0);
  await page.getByRole("button", { name: "First position" }).click();
  await expect(page.locator("[data-square=e8]")).toHaveAttribute(
    "aria-label",
    "e8 black king",
  );
});
test("PGN import and export retain player and event metadata", async ({
  page,
}) => {
  await page.goto("");
  await page.getByRole("button", { name: "Import game", exact: false }).click();
  await page
    .getByLabel("PGN or FEN", { exact: true })
    .fill(
      '[Event "Club final"]\n[White "Alice"]\n[Black "Bob"]\n\n1. e4 e5 2. Nf3',
    );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import game", exact: true })
    .click();
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PGN", exact: false }).click();
  const stream = await (await promise).createReadStream();
  let pgn = "";
  for await (const chunk of stream) pgn += chunk.toString();
  expect(pgn).toContain('[Event "Club final"]');
  expect(pgn).toContain('[White "Alice"]');
  expect(pgn).toContain('[Black "Bob"]');
  expect(pgn).toContain("1. e4 e5 2. Nf3");
});
