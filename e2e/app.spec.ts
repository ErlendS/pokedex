import { expect, test } from "@playwright/test";

test("loads the Pokedex and starts a guessing round", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Pokedex" })).toBeVisible();
  await page.getByRole("button", { name: "Who's That Pokemon?" }).click();
  await expect(page.getByPlaceholder("Who's that Pokemon?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Skip Pokémon/ })).toBeVisible();
});

test("hosts a versus match, joins from a second device, and awards points", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Versus" }).click();
  await page.getByRole("button", { name: "Start en match" }).click();
  const code = await page.locator(".versus-code strong").textContent();
  expect(code).toMatch(/^[A-Z2-9]{5}$/);
  await expect(page.getByAltText(/QR-kode for match/)).toBeVisible();
  await expect(page.locator(".versus-qr-mark")).toBeVisible();

  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await player.goto(`/?versus=${code}`);
  await player.getByLabel("Navn").fill("Misty");
  await player.getByRole("button", { name: "Bli med i kampen" }).click();
  await expect(page.getByText("Misty")).toBeVisible();

  await page.getByRole("button", { name: "Start runden" }).click();
  await player.getByLabel("Ditt Pokémon-svar").fill("Pikachu");
  await player.getByRole("button", { name: "Gjett" }).click();
  await expect(player.getByText(/Misty var raskest: \+\d+/)).toBeVisible();
  await expect(page.locator(".versus-scoreboard li")).toContainText(/Misty.*[1-9]\d*/);
  await playerContext.close();
});
