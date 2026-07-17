async function clearMarks(page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-agent-mark-id]').forEach(el => el.removeAttribute('data-agent-mark-id'));
  });
}