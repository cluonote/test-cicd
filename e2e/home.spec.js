import { test, expect } from '@playwright/test'

test('打开首页 → 点击计数器 → 看到更新后的文案', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '111' })).toBeVisible()

  const counter = page.getByRole('button', { name: /Count is/ })
  await expect(counter).toHaveText('Count is 0')

  await counter.click()
  await expect(counter).toHaveText('Count is 1')
})
