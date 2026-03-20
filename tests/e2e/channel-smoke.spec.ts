import { expect, test } from "@playwright/test";

test("passenger channel homepage loads bootstrap dashboard", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "机上频道、联机房间与实时游戏状态已经接通"
    })
  ).toBeVisible();
  await expect(
    page.getByText("MU Game Channel", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "积分中心"
    })
  ).toBeVisible();
  await expect(page.getByText("Game Package Launcher")).toBeVisible();
});

test("admin channel page can log in and load published content controls", async ({
  page
}) => {
  await page.goto("/admin/channel");

  await expect(
    page.getByRole("heading", {
      name: "后台登录与权限控制"
    })
  ).toBeVisible();

  await page.getByRole("button", { name: "登录" }).click();

  await expect(
    page.getByRole("heading", {
      name: "草稿与发布状态"
    })
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "保存草稿"
    })
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "发布到前台"
    })
  ).toBeVisible();
});

test("admin operations page can log in and load rules and airline controls", async ({
  page
}) => {
  await page.goto("/admin/operations");

  await expect(
    page.getByRole("heading", {
      name: "积分规则与航司接口后台"
    })
  ).toBeVisible();

  await page.getByRole("button", { name: "登录" }).click();

  await expect(
    page.getByRole("heading", {
      name: "游戏积分规则配置"
    })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "航司积分接口配置"
    })
  ).toBeVisible();
});
