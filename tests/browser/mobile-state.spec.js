import { test, expect } from "@playwright/test";
import { Chess } from "chess.js";
import { DEFAULT_SETTINGS, newSession } from "../../src/chess.js";

const whiteMate = "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#";
const blackMate = "1. f3 e5 2. g4 Qh4#";
const read = page => page.evaluate(() => JSON.parse(localStorage.getItem("quiet-knight-v1")).session);
async function seed(page, { human = "w", pgn = "", fen, result = null, time = "Untimed", clocks } = {}) {
  const game = new Chess(fen);
  if (pgn) game.loadPgn(pgn);
  const session = { ...newSession({ ...DEFAULT_SETTINGS, side: human, time, sound: false, undo: true, delay: 2500 }),
    ...(fen ? { startFen: fen } : {}), pgn: pgn ? game.pgn() : "", result,
    ...(clocks ? { clocks } : {}) };
  await page.addInitScript(s => localStorage.setItem("quiet-knight-v1", JSON.stringify({ version: 1, session: s })), session);
  await page.goto("");
}
for (const [name, state, heading] of [
  ["checkmate overrides stale saved result", {human:"w",pgn:whiteMate,result:"Black wins on time"}, "You won."],
  ["White human checkmates", {human:"w",pgn:whiteMate}, "You won."],
  ["Black human checkmates", {human:"b",pgn:blackMate}, "You won."],
  ["White bot checkmates", {human:"b",pgn:whiteMate}, "Game over."],
  ["Black bot checkmates", {human:"w",pgn:blackMate}, "Game over."],
  ["stalemate", {fen:"7k/5K2/6Q1/8/8/8/8/8 b - - 0 1"}, "It's a draw."],
  ["insufficient material", {fen:"7k/8/5K2/8/8/8/8/8 w - - 0 1"}, "It's a draw."],
  ["fifty moves", {fen:"7k/8/5K2/8/8/8/R7/8 w - - 100 75"}, "It's a draw."],
  ["threefold repetition", {pgn:"1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8"}, "It's a draw."],
  ["human White wins on time", {human:"w", result:"White wins on time"}, "You won."],
  ["human Black wins on time", {human:"b", result:"Black wins on time"}, "You won."],
  ["human loses on time", {human:"w", result:"Black wins on time"}, "Game over."],
  ["draw on time", {result:"Draw on time — opponent cannot checkmate"}, "It's a draw."],
  ["White human resigns", {human:"w", result:"Black wins by resignation"}, "You resigned."],
  ["Black human resigns", {human:"b", result:"White wins by resignation"}, "You resigned."],
  ["White bot resigns", {human:"b", result:"Black wins by resignation"}, "You won."],
  ["Black bot resigns", {human:"w", result:"White wins by resignation"}, "You won."],
  ["human turn", {}, "Your move."],
  ["bot turn", {human:"b"}, "Thinking..."],
]) test(`heading: ${name}`, async ({page}) => {
  await seed(page, state);
  await expect(page.locator("h1")).toHaveText(heading);
});

for (const human of ["w","b"]) test(`heading updates immediately after ${human} delivers checkmate`, async ({page}) => {
  const pgn = human === "w" ? "1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6" : "1. f3 e5 2. g4";
  await seed(page,{human,pgn});
  await page.getByRole("button",{name:/Resume game/}).click();
  await expect(page.locator("h1")).toHaveText("Your move.");
  for (const square of human === "w" ? ["h5","f7"] : ["d8","h4"])
    await page.locator(`[data-square=${square}]`).click();
  await expect(page.locator("h1")).toHaveText("You won.");
  expect((await read(page)).result).toContain("wins by checkmate");
  await page.getByRole("button",{name:"New game",exact:true}).click();
  await page.getByLabel("Play as").selectOption("w");
  await page.getByRole("button",{name:"Let’s play"}).click();
  await expect(page.locator("h1")).toHaveText("Your move.");
  expect((await read(page)).result).toBeNull();
});

test("heading updates when the running clock expires", async ({page}) => {
  await seed(page,{time:"3 min",clocks:{w:120,b:180000}});
  await page.getByRole("button",{name:/Start playing/}).click();
  await expect(page.locator("h1")).toHaveText("Game over.");
  expect((await read(page)).result).toBe("Black wins on time");
});

test("heading updates after resignation confirmation", async ({page}) => {
  await seed(page);
  await page.getByRole("button",{name:"Resign",exact:true}).click();
  await page.getByRole("button",{name:"Resign game",exact:true}).click();
  await expect(page.locator("h1")).toHaveText("You resigned.");
});

// Use wheel input in Chromium and keyboard scrolling in mobile WebKit, whose
// Playwright adapter does not support wheel or swipe input. No auto-scrolling.
async function reach(page, locator) {
  for (let i=0;i<30;i++) {
    const box=await locator.boundingBox();
    const height=page.viewportSize().height;
    if (box && box.y >= 0 && box.y+box.height <= height) {
      expect(await locator.evaluate(el => {const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return el===hit || el.contains(hit);})).toBe(true);
      return;
    }
    await page.mouse.move(page.viewportSize().width-6,height/2);
    if (test.info().project.name === "webkit-mobile") {
      for (let step=0; step<4; step++) await page.keyboard.press(box?.y<0?"ArrowUp":"ArrowDown");
    } else await page.mouse.wheel(0,box?.y<0?-180:180);
    await page.waitForTimeout(30);
  }
  throw new Error(`Control was unreachable through scrolling: ${await locator.getAttribute('aria-label') || await locator.textContent()}`);
}
for (const viewport of [{width:390,height:664},{width:320,height:568},{width:844,height:390},{width:667,height:320}])
 test(`normal mobile scrolling reaches every control at ${viewport.width}x${viewport.height}`, async ({page})=>{
  await page.setViewportSize(viewport);
  await seed(page);
  // Same-page resizing approximates toolbar changes, not actual Safari chrome.
  await page.setViewportSize({...viewport,height:viewport.height+100});
  await reach(page,page.getByRole("button",{name:/About & open-source licenses/}));
  await page.setViewportSize(viewport);
  for (const selector of ['html','body','#root','main']) {
    const layout=await page.locator(selector).evaluate(el=>({overflow:getComputedStyle(el).overflowY,position:getComputedStyle(el).position}));
    expect(["hidden","clip"]).not.toContain(layout.overflow);
    expect(layout.position).not.toBe("fixed");
  }
  const controls = page.locator('header button, header a, main button:not(.square), main input, main select, main a, footer button, footer a');
  for (const locator of await controls.all()) await reach(page,locator);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(viewport.width);
  await reach(page,page.getByRole("button",{name:"New game",exact:true}));
  await page.getByRole("button",{name:"New game",exact:true}).click();
  const dialog=page.getByRole("dialog");
  const box=await dialog.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
  await dialog.evaluate(el=>el.scrollTo(0,el.scrollHeight));
  await expect(page.getByRole("button",{name:"Let’s play"})).toBeInViewport();
  await page.screenshot({path:`test-results/scroll-${viewport.width}x${viewport.height}.png`});
 });

test("touch swipe from an empty board square scrolls the document",async({page,browserName})=>{
  test.skip(browserName!=="chromium","CDP touch gesture requires Chromium; WebKit has separate layout coverage.");
  await page.setViewportSize({width:390,height:664});
  await seed(page);
  const square=await page.locator('[data-square="e4"]').boundingBox();
  const start={x:square.x+square.width/2,y:square.y+square.height/2};
  const cdp=await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[start]});
  for(let i=1;i<=10;i++) {
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:start.x,y:start.y-i*18}]});
    await page.waitForTimeout(20);
  }
  await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(50);
  await cdp.detach();
});

for(const viewport of [{width:320,height:568},{width:667,height:320}]) test(`promotion fits mobile ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  await seed(page,{fen:"1r2k3/P6p/8/8/8/8/7P/4K3 w - - 0 1"});
  await page.getByRole("button",{name:/Start playing/}).click();
  await page.locator('[data-square="a7"]').click();
  await page.locator('[data-square="b8"]').click();
  const dialog=page.getByRole("dialog",{name:"Choose promotion"});
  const box=await dialog.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y+box.height).toBeLessThanOrEqual(viewport.height);
  for(const name of ["queen","rook","bishop","knight"])
    await expect(dialog.getByRole("button",{name:`Promote to ${name}`})).toBeInViewport();
  await dialog.getByRole("button",{name:"Promote to knight"}).click();
  await expect(dialog).toHaveCount(0);
  expect((await read(page)).pgn).toContain("=N");
});


test("heading updates when the bot clock expires", async ({page}) => {
  await seed(page,{pgn:"1. e4",time:"3 min",clocks:{w:180000,b:120}});
  await page.getByRole("button",{name:/Resume game/}).click();
  await expect(page.locator("h1")).toHaveText("You won.");
  expect((await read(page)).result).toBe("White wins on time");
});

test("heading updates immediately after a move produces stalemate", async ({page}) => {
  await seed(page,{fen:"7k/5K2/8/6Q1/8/8/8/8 w - - 0 1"});
  await page.getByRole("button",{name:/Start playing/}).click();
  await page.locator('[data-square="g5"]').click();
  await page.locator('[data-square="g6"]').click();
  await expect(page.locator("h1")).toHaveText("It's a draw.");
  expect((await read(page)).result).toBe("Draw by stalemate");
});


for (const [name, state, heading] of [
  ["human turn", {}, "Your move."],
  ["bot turn", {human:"b"}, "Thinking..."],
  ["human win", {pgn:whiteMate}, "You won."],
  ["bot win", {pgn:blackMate}, "Game over."],
  ["draw", {fen:"7k/5K2/6Q1/8/8/8/8/8 b - - 0 1"}, "It's a draw."],
  ["human resignation", {result:"Black wins by resignation"}, "You resigned."],
  ["bot resignation", {result:"White wins by resignation"}, "You won."],
]) test(`narrow heading fits without control overlap: ${name}`, async ({page}) => {
  await page.setViewportSize({width:320,height:568});
  await seed(page,state);
  await expect(page.locator("h1")).toHaveText(heading);
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(320);
  const title=await page.locator("h1").boundingBox();
  const button=await page.getByRole("button",{name:"New game",exact:true}).boundingBox();
  expect(title.x).toBeGreaterThanOrEqual(0);
  expect(title.x+title.width).toBeLessThanOrEqual(320);
  const overlapX=Math.max(0,Math.min(title.x+title.width,button.x+button.width)-Math.max(title.x,button.x));
  const overlapY=Math.max(0,Math.min(title.y+title.height,button.y+button.height)-Math.max(title.y,button.y));
  expect(overlapX*overlapY).toBe(0);
});
