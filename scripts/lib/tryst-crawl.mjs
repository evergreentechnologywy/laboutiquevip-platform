export async function collectProfileLinksForCity(cityUrl, fetchPageText, limits) {
  const profileLimit = limits.maxProfilesPerCity;
  const maxListingPages = limits.maxListingPagesPerCity || 50;
  const profileLinks = new Set();
  const visitedPages = new Set();
  const base = cityUrl.replace(/\/$/, "");
  const queue = [base];
  
  // Force minimum pages — Jina often fails on page 1 but succeeds on page 2+
  const MIN_PAGES = 5;
  const MAX_EMPTY_PAGES = 3; // auto-stop after 3 consecutive empties (post-MIN_PAGES)
  let emptyPages = 0;
  let manualPageGen = 2; // synthetic page URL counter if pagination links not found

  while (queue.length > 0 && visitedPages.size < maxListingPages) {
    const pageUrl = queue.shift();
    if (!pageUrl || visitedPages.has(pageUrl)) continue;
    visitedPages.add(pageUrl);

    // Fetch with retry — Jina mirror is flaky on first attempt
    let listingText = await fetchPageText(pageUrl);
    if (!listingText) {
      // Retry once after 2s delay
      await new Promise(r => setTimeout(r, 2000));
      listingText = await fetchPageText(pageUrl);
    }
    if (!listingText) continue;

    let newOnThisPage = 0;
    for (const profileUrl of extractProfileLinksFromMarkdown(listingText, 0)) {
      if (profileLimit > 0 && profileLinks.size >= profileLimit) break;
      if (!profileLinks.has(profileUrl)) {
        profileLinks.add(profileUrl);
        newOnThisPage++;
      }
    }

    if (profileLimit > 0 && profileLinks.size >= profileLimit) break;

    // Auto-stop logic: only after MIN_PAGES minimum
    if (newOnThisPage === 0) {
      emptyPages++;
      if (visitedPages.size >= MIN_PAGES && emptyPages >= MAX_EMPTY_PAGES) break;
    } else {
      emptyPages = 0;
    }

    // Extract pagination links from the markdown
    const paginationLinks = extractListingPaginationLinks(listingText, pageUrl);
    
    // If no pagination links found in markdown but we haven't hit limits,
    // synthetically generate next page URLs (Tryst uses ?page=N pattern)
    if (paginationLinks.length === 0 && visitedPages.size < maxListingPages && emptyPages < MAX_EMPTY_PAGES) {
      const nextPage = `${base}?page=${manualPageGen}`;
      if (!visitedPages.has(nextPage) && !queue.includes(nextPage)) {
        queue.push(nextPage);
        manualPageGen++;
      }
    } else {
      for (const nextPage of paginationLinks) {
        if (!visitedPages.has(nextPage) && !queue.includes(nextPage)) {
          queue.push(nextPage);
        }
      }
    }
  }

  console.log(`  [city-crawl] ${cityUrl.split("/").slice(-2).join("/")}: ${profileLinks.size} profiles / ${visitedPages.size} pages`);
  return sliceToLimit([...profileLinks], profileLimit);
}