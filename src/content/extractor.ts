// Content script for page metadata extraction and reader mode
(() => {
  // Listen for extraction requests
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "EXTRACT_PAGE_INFO") {
      const getMeta = (names: string[]) => {
        for (const name of names) {
          const el = document.querySelector(
            `meta[name='${name}'], meta[property='${name}'], meta[itemprop='${name}']`
          );
          if (el) {
            const content = el.getAttribute("content");
            if (content) return content.trim();
          }
        }
        return "";
      };

      const title =
        getMeta(["og:title", "twitter:title"]) ||
        document.title ||
        window.location.href;

      const description =
        getMeta(["description", "og:description", "twitter:description"]) ||
        "";

      const ogImage =
        getMeta(["og:image", "twitter:image", "twitter:image:src"]) ||
        "";

      const keywords = getMeta(["keywords", "news_keywords"]);
      const tags: string[] = [];
      if (keywords) {
        keywords.split(",").forEach((k) => {
          const clean = k.trim().toLowerCase();
          if (clean.length > 1 && clean.length < 25) tags.push(clean);
        });
      }

      // Extract main readable content
      let text = "";
      const articleEl = document.querySelector("article") || document.querySelector("main") || document.body;
      if (articleEl) {
        text = (articleEl as HTMLElement).innerText.slice(0, 5000);
      }

      sendResponse({
        title,
        url: window.location.href,
        description,
        ogImage,
        tags: tags.slice(0, 6),
        readerText: text,
      });
    }
  });
})();
