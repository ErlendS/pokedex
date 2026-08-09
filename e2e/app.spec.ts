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

  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await player.goto(`/?versus=${code}`);
  await player.getByLabel("Name").fill("Misty");
  await player.getByRole("button", { name: "Join match" }).click();
  await expect(page.getByText("Misty")).toBeVisible();

  const secondPlayer = await playerContext.newPage();
  await secondPlayer.goto(`/?versus=${code}`);
  await secondPlayer.getByLabel("Name").fill("Brock");
  await secondPlayer.getByRole("button", { name: "Join match" }).click();
  await expect(page.getByText("Brock")).toBeVisible();

  await page.getByRole("button", { name: "Start round" }).click();
  await expect(player.getByText(/Round 1 is live in the 3D scene/)).toBeVisible();
  await expect(secondPlayer.getByText(/Round 1 is live in the 3D scene/)).toBeVisible();
  await expect(player.locator("canvas")).toBeVisible();
  await expect(player.getByRole("progressbar", { name: "Time remaining in round" })).toBeVisible();
  const hostDeadline = await page.locator(".versus-countdown").getAttribute("data-deadline");
  await expect(player.locator(".versus-countdown")).toHaveAttribute("data-deadline", hostDeadline ?? "");
  await expect(secondPlayer.locator(".versus-countdown")).toHaveAttribute("data-deadline", hostDeadline ?? "");

  await player.getByLabel("Your Pokémon answer").fill("Pikachu");
  await player.getByRole("button", { name: "Guess" }).click();
  await expect(player.getByRole("button", { name: "Answered" })).toBeDisabled();
  await expect(page.getByText("The answer is", { exact: true })).not.toBeVisible();

  await secondPlayer.getByLabel("Your Pokémon answer").fill("Bulbasaur");
  await secondPlayer.getByRole("button", { name: "Guess" }).click();
  await expect(page.getByText("The answer is", { exact: true })).toBeVisible();
  await expect(page.getByText("Pikachu", { exact: true })).toBeVisible();
  await expect(player.getByText("Shown for 15 seconds before the next round.")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Time until next round" })).toBeVisible();
  const revealDeadline = Number(await page.locator(".versus-countdown").getAttribute("data-deadline"));
  const revealStartedAt = Number(await page.locator(".versus-countdown").getAttribute("data-started-at"));
  expect(revealDeadline - revealStartedAt).toBe(15_000);
  await expect(page.locator(".versus-scoreboard li").filter({ hasText: "Misty" })).toContainText(/[1-9]\d*/);
  await expect(page.locator(".versus-scoreboard li").filter({ hasText: "Brock" })).toContainText(/0/);

  await expect(page.getByText(/Round 2 is live in the 3D scene/)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("The answer is", { exact: true })).not.toBeVisible();
  await player.getByRole("button", { name: "Pokedex" }).click();
  await expect(player).not.toHaveURL(/versus=/);
  await expect(player.getByRole("button", { name: "Pokedex" })).toBeVisible();
  await playerContext.close();
});
