import { expect, test } from "@playwright/test";

test("passenger channel homepage loads bootstrap dashboard", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      name: "欢迎进入机上游戏频道"
    })
  ).toBeVisible();
  await expect(
    page.getByText("本次测试的 4 款游戏")
  ).toBeVisible();
  await expect(
    page.getByText("2048", { exact: true })
  ).toBeVisible();
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

test("imported globe static package routes load inside the channel shell", async ({
  page
}) => {
  const routes = [
    {
      heading: "2048",
      path: "/games/globe-2048"
    },
    {
      heading: "国际象棋",
      path: "/games/globe-chess"
    },
    {
      heading: "六边形俄罗斯方块",
      path: "/games/globe-hextris"
    },
    {
      heading: "数独",
      path: "/games/globe-sudoku"
    }
  ];

  for (const route of routes) {
    await page.goto(route.path);

    await expect(
      page.getByRole("heading", {
        exact: true,
        name: route.heading
      })
    ).toBeVisible();
    await expect(
      page.locator("iframe[title*='static package']")
    ).toBeVisible();
  }
});
