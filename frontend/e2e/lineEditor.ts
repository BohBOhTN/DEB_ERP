import { expect, type Locator, type Page } from "@playwright/test";

/// Issue 009 layout check, run at every project width: a line of the
/// `LineEditor` never overflows its card or row, its remove button stays
/// inside it, and the layout matches the container: a header row and no
/// field labels when wide, field labels and no header row when narrow.
export async function expectLineEditorFits(page: Page, line: Locator) {
  const metrics = await line.evaluate((element) => {
    const card = element as HTMLElement;
    const header = card.closest("ul")?.previousElementSibling as
      HTMLElement | null | undefined;
    const remove = card.querySelector("button[aria-label^='Retirer']");
    const cardBox = card.getBoundingClientRect();
    const removeBox = remove?.getBoundingClientRect();
    const labels = Array.from(card.querySelectorAll("span")).filter(
      (span) =>
        span.textContent?.trim() === "Prix unitaire" &&
        getComputedStyle(span).display !== "none",
    );
    return {
      overflow: card.scrollWidth - card.clientWidth,
      headerDisplay: header ? getComputedStyle(header).display : "none",
      removeInside:
        removeBox !== undefined &&
        removeBox.right <= cardBox.right + 1 &&
        removeBox.bottom <= cardBox.bottom + 1 &&
        removeBox.left >= cardBox.left - 1,
      visibleLabels: labels.length,
      width: card.clientWidth,
    };
  });
  const pageOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

  expect(metrics.overflow, "the line overflows its card").toBeLessThanOrEqual(
    1,
  );
  expect(pageOverflow, "the page scrolls horizontally").toBeLessThanOrEqual(0);
  expect(metrics.removeInside, "the remove button left the card").toBe(true);
  if (metrics.headerDisplay === "grid") {
    expect(metrics.visibleLabels, "field labels shown with the header").toBe(0);
  } else {
    expect(metrics.visibleLabels, "no field label in the card layout").toBe(1);
  }
}
