import { expect, test } from "@playwright/test";

test("loads the Pokedex and starts a guessing round", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Pokedex" })).toBeVisible();
  await page.getByRole("button", { name: "Who's That Pokemon?" }).click();
  await expect(page.getByPlaceholder("Who's that Pokemon?")).toBeVisible();
  await expect(page.getByRole("button", { name: /Skip Pokémon/ })).toBeVisible();
});

test("hosts a versus match, joins from a second device, and awards points", async ({ page, browser }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Versus" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "Start a match" }).click();
  const code = await page.locator(".versus-code strong").textContent();
  expect(code).toMatch(/^[A-Z2-9]{5}$/);
  await expect(page.getByAltText(/QR code for match/)).toBeVisible();
  await expect(page.locator(".versus-qr-mark")).toBeVisible();
  await expect(page.getByLabel("Your Pokémon answer")).toHaveCount(0);
  await expect(page.locator(".versus-scoreboard li")).toHaveCount(0);
  const castConfigResponse = await page.request.get("/api/cast-config");
  expect(await castConfigResponse.json()).toMatchObject({ appId: "9DF86F21", receiverPath: "/cast" });
  await expect(page.locator(".versus-cast-button")).toHaveCount(0);

  const displayContext = await browser.newContext();
  const display = await displayContext.newPage();
  await display.goto(`/cast?room=${code}`);
  await expect(display.getByRole("heading", { name: "Pokédex Versus" })).toBeVisible();
  await expect(display.getByText(code ?? "", { exact: true })).toBeVisible();
  await expect(display.getByAltText(/QR code for match/)).toBeVisible();
  await expect(display.locator("canvas")).toBeVisible();

  const firstPlayerContext = await browser.newContext();
  const firstPlayer = await firstPlayerContext.newPage();
  await firstPlayer.goto(`/?versus=${code}`);
  await expect(firstPlayer.locator("canvas")).toHaveCount(0);
  await expect(firstPlayer.getByRole("button", { name: "Pokedex" })).toHaveCount(0);
  await firstPlayer.getByLabel("Name").fill("Ash");
  await firstPlayer.getByRole("button", { name: "Join match" }).click();
  await expect(page.getByText("Ash")).toBeVisible();

  const secondPlayerContext = await browser.newContext();
  const secondPlayer = await secondPlayerContext.newPage();
  await secondPlayer.goto(`/?versus=${code}`);
  await expect(secondPlayer.locator("canvas")).toHaveCount(0);
  await secondPlayer.getByLabel("Name").fill("Misty");
  await secondPlayer.getByRole("button", { name: "Join match" }).click();
  await expect(page.getByText("Misty")).toBeVisible();

  await page.getByRole("button", { name: "Start round" }).click();
  await expect(page.getByText(/Round 1 is live on the display/)).toBeVisible();
  await expect(firstPlayer.getByText(/Round 1 — enter your guess/)).toBeVisible();
  await expect(secondPlayer.getByText(/Round 1 — enter your guess/)).toBeVisible();
  await expect(display.getByText(/Round 1 — guess now/)).toBeVisible();
  await expect(firstPlayer.locator("canvas")).toHaveCount(0);
  await expect(firstPlayer.locator(".versus-scoreboard")).toHaveCount(0);
  await expect(firstPlayer.getByRole("progressbar")).toHaveCount(0);
  const hostDeadline = await page.locator(".versus-countdown").getAttribute("data-deadline");
  await expect(display.locator(".versus-countdown")).toHaveAttribute("data-deadline", hostDeadline ?? "");

  await firstPlayer.getByLabel("Your Pokémon answer").fill("Pikachu");
  await firstPlayer.getByRole("button", { name: "Guess" }).click();
  await expect(firstPlayer.getByRole("button", { name: "Answered" })).toBeDisabled();
  await expect(display.getByText("The answer is", { exact: true })).not.toBeVisible();

  await secondPlayer.getByLabel("Your Pokémon answer").fill("Bulbasaur");
  await secondPlayer.getByRole("button", { name: "Guess" }).click();
  await expect(page.getByText("The answer is", { exact: true })).toBeVisible();
  await expect(display.getByText("The answer is", { exact: true })).toBeVisible();
  await expect(page.getByText("Pikachu", { exact: true })).toBeVisible();
  await expect(firstPlayer.getByText("The answer is", { exact: true })).toHaveCount(0);
  await expect(firstPlayer.getByText("Pikachu", { exact: true })).toHaveCount(0);
  await expect(firstPlayer.getByText(/Round 1 complete/)).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Time until next round" })).toBeVisible();
  const revealDeadline = Number(await page.locator(".versus-countdown").getAttribute("data-deadline"));
  const revealStartedAt = Number(await page.locator(".versus-countdown").getAttribute("data-started-at"));
  expect(revealDeadline - revealStartedAt).toBe(15_000);
  await expect(page.locator(".versus-scoreboard li").filter({ hasText: "Ash" })).toContainText(/[1-9]\d*/);
  await expect(page.locator(".versus-scoreboard li").filter({ hasText: "Misty" })).toContainText(/0/);

  await expect(page.getByText(/Round 2 is live on the display/)).toBeVisible({ timeout: 25_000 });
  await expect(display.getByText(/Round 2 — guess now/)).toBeVisible();
  await expect(page.getByText("The answer is", { exact: true })).not.toBeVisible();
  await expect(firstPlayer.getByLabel("Your Pokémon answer")).toBeVisible();
  await firstPlayerContext.close();
  await secondPlayerContext.close();
  await displayContext.close();
});
