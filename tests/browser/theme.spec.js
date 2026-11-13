import { test, expect } from "@playwright/test";

for (const colorScheme of ["light", "dark"]) {
  test(`device preference ${colorScheme} applies before application scripts`, async ({page}) => {
    await page.emulateMedia({colorScheme});
    await page.route("**/assets/*.js", route => route.abort());
    await page.goto("");
    await expect(page.locator("html")).toHaveAttribute("data-theme",colorScheme);
    expect(await page.locator("#root").innerHTML()).toBe("");
    expect(await page.evaluate(()=>getComputedStyle(document.documentElement).colorScheme)).toBe(colorScheme);
  });
}
test("saved preference applies before application scripts and overrides device",async({page})=>{
  await page.emulateMedia({colorScheme:"light"});
  await page.addInitScript(()=>localStorage.setItem("quiet-knight-theme","dark"));
  await page.route("**/assets/*.js", route=>route.abort());
  await page.goto("");
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  expect(await page.locator("#root").innerHTML()).toBe("");
});
for(const viewport of [{width:1440,height:1000},{width:390,height:664},{width:320,height:568},{width:667,height:320}]) {
 test(`theme toggle persists and fits ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.emulateMedia({colorScheme:"light"});
  await page.goto("");
  const toggle=page.getByRole("button",{name:"Switch to dark mode"});
  await expect(toggle).toBeInViewport();
  await toggle.tap();
  await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
  expect(await page.evaluate(()=>localStorage.getItem("quiet-knight-theme"))).toBe("dark");
  await page.reload();
  await expect(page.getByRole("button",{name:"Switch to light mode"})).toBeInViewport();
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(viewport.width);
  await page.screenshot({path:`test-results/theme-dark-${viewport.width}.png`,fullPage:true});
  await page.getByRole("button",{name:"New game",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({path:`test-results/theme-dialog-${viewport.width}.png`});
  await page.keyboard.press("Escape");
  const light=page.getByRole("button",{name:"Switch to light mode"});
  await light.focus(); await page.keyboard.press("Enter");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");
 });
}
test("system changes follow device until a choice is saved",async({page})=>{
 await page.emulateMedia({colorScheme:"light"});await page.goto("");
 await page.emulateMedia({colorScheme:"dark"});
 await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
 await page.getByRole("button",{name:"Switch to light mode"}).click();
 await page.emulateMedia({colorScheme:"light"});await page.emulateMedia({colorScheme:"dark"});
 await expect(page.locator("html")).toHaveAttribute("data-theme","light");
});
test("unavailable storage does not prevent theme use",async({page})=>{
 await page.emulateMedia({colorScheme:"dark"});
 await page.addInitScript(()=>Object.defineProperty(window,"localStorage",{get(){throw new Error("Storage disabled");}}));
 await page.goto("");await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
 await page.getByRole("button",{name:"Switch to light mode"}).click();
 await expect(page.locator("html")).toHaveAttribute("data-theme","light");
});
for(const theme of ["light","dark"]) test(`text pieces and board indicators contrast in ${theme}`,async({page})=>{
 await page.emulateMedia({colorScheme:theme});await page.goto("");
 const ratios=await page.evaluate(()=>{
  const style=getComputedStyle(document.documentElement);
  const rgb=name=>{const hex=style.getPropertyValue(name).trim();return [1,3,5].map(n=>parseInt(hex.slice(n,n+2),16));};
  const lum=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0);
  const ratio=(a,b)=>{a=lum(rgb(a));b=lum(rgb(b));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
  const text=[['--ink','--paper'],['--muted','--paper'],['--accent','--paper'],['--ink','--surface'],['--accent','--accent-soft'],['--danger','--danger-soft']].map(([a,b])=>({name:a+b,ratio:ratio(a,b)}));
  const board=['--square-light','--square-dark','--last-light','--last-dark','--board-selected','--check-square'];
  const indicators=board.map(bg=>({name:bg,ratio:ratio('--board-marker',bg)}));
  indicators.push({name:'selected',ratio:ratio('--board-accent','--board-selected')},{name:'check',ratio:ratio('--board-danger','--check-square')});
  const pieces=board.flatMap(bg=>[['--piece-white-fill','--piece-white-line'],['--piece-black-fill','--piece-black-line']].map(([fill,edge])=>({name:fill+bg,ratio:Math.max(ratio(fill,bg),ratio(edge,bg))})));
  return {text,indicators,pieces};
 });
 for(const r of ratios.text) expect(r.ratio,r.name).toBeGreaterThanOrEqual(4.5);
 for(const r of [...ratios.indicators,...ratios.pieces]) expect(r.ratio,r.name).toBeGreaterThanOrEqual(3);
});
