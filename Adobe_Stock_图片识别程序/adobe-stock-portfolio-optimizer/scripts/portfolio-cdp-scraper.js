const fs = require("fs");
const path = require("path");

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function splitKeywords(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function textBetween(text, start, end) {
  const match = String(text || "").match(
    new RegExp(`${start}\\s+(.+?)\\s+${end}`, "i")
  );
  return match ? cleanText(match[1]) : "";
}

function parseDetailText(value) {
  const text = cleanText(value);
  const assetMatch = text.match(/FILE\s*#\s*(\d+)/i);
  const keywordsMatch = text.match(
    /Keywords\s*(?:\(\s*\d+\s*\))?\s+(.+?)(?:\s+(?:RELEASES|DOWNLOADS|Go to Page|Change region)|$)/i
  );
  const keywords = keywordsMatch ? splitKeywords(keywordsMatch[1]) : [];

  return {
    assetId: assetMatch ? assetMatch[1] : "",
    title: textBetween(text, "Title", "Category"),
    category: textBetween(text, "Category", "Language"),
    language: textBetween(text, "Language", "Keywords"),
    keywords,
    keywordText: keywords.join(", "),
    keywordCount: keywords.length,
  };
}

function buildOptions(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--autoNextPage") {
      options.autoNextPage = true;
      continue;
    }

    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = args[index + 1];
    index += 1;
    if (value == null) continue;

    const number = Number(value);
    options[key] = Number.isFinite(number) ? number : value;
  }

  return options;
}

function toCsv(records) {
  const headers = [
    "row",
    "asset_id",
    "title",
    "keywords",
    "keyword_count",
    "category",
    "language",
    "thumbnail",
  ];
  const rows = records.map((record, index) => [
    index + 1,
    record.assetId,
    record.title,
    record.keywordText,
    record.keywordCount,
    record.category,
    record.language,
    record.thumbnail,
  ]);

  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

function createCdpClient(webSocketDebuggerUrl) {
  let nextId = 1;
  const pending = new Map();
  const socket = new WebSocket(webSocketDebuggerUrl);

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!pending.has(message.id)) return;
    const item = pending.get(message.id);
    pending.delete(message.id);
    message.error
      ? item.reject(new Error(message.error.message || JSON.stringify(message.error)))
      : item.resolve(message.result);
  });

  function waitOpen() {
    if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
  }

  async function send(method, params = {}) {
    await waitOpen();
    const id = nextId;
    nextId += 1;
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  return {
    send,
    close() {
      socket.close();
    },
  };
}

function browserScrapeFunction(options) {
  const settings = Object.assign(
    {
      maxItems: 100,
      maxPages: 1,
      autoNextPage: false,
      clickDelayMs: 1200,
      nextPageDelayMs: 2200,
    },
    options || {}
  );

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const split = (value) =>
    String(value || "")
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean);
  const between = (text, start, end) => {
    const match = String(text || "").match(
      new RegExp(`${start}\\s+(.+?)\\s+${end}`, "i")
    );
    return match ? clean(match[1]) : "";
  };
  const parse = (value) => {
    const text = clean(value);
    const asset = text.match(/FILE\s*#\s*(\d+)/i);
    const keywordMatch = text.match(
      /Keywords\s*(?:\(\s*\d+\s*\))?\s+(.+?)(?:\s+(?:RELEASES|DOWNLOADS|Go to Page|Change region)|$)/i
    );
    const keywords = keywordMatch ? split(keywordMatch[1]) : [];
    return {
      assetId: asset ? asset[1] : "",
      title: between(text, "Title", "Category"),
      category: between(text, "Category", "Language"),
      language: between(text, "Language", "Keywords"),
      keywords,
      keywordText: keywords.join(", "),
      keywordCount: keywords.length,
    };
  };
  const thumbnailId = (src) => {
    const match = String(src || "").match(/[_-]F[_-](\d{6,})[_-]/i);
    return match ? match[1] : "";
  };
  const currentDetail = () => {
    const text = document.body.innerText || "";
    const index = text.indexOf("FILE #");
    return index >= 0 ? parse(text.slice(index)) : null;
  };
  const visibleGridImages = () => {
    const images = Array.from(document.images)
      .map((image) => {
        const rect = image.getBoundingClientRect();
        const id = thumbnailId(image.currentSrc || image.src);
        return {
          image,
          id,
          src: image.currentSrc || image.src || "",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter(
        (item) =>
          item.id &&
          item.width >= 70 &&
          item.height >= 50 &&
          item.top >= 0 &&
          item.left >= 0 &&
          item.left < window.innerWidth - 80
      )
      .sort((a, b) => a.top - b.top || a.left - b.left);

    const seen = new Set();
    return images.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };
  const preloadPageImages = async () => {
    const scroller = document.scrollingElement || document.documentElement;
    window.scrollTo(0, 0);
    await sleep(400);

    let lastHeight = 0;
    let stableRounds = 0;
    for (let step = 0; step < 80 && stableRounds < 3; step += 1) {
      const height = scroller.scrollHeight;
      const nextY = Math.min(
        height,
        window.scrollY + Math.max(500, Math.floor(window.innerHeight * 0.8))
      );
      window.scrollTo(0, nextY);
      await sleep(180);

      if (Math.abs(height - lastHeight) < 5 && nextY + window.innerHeight >= height - 20) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }
      lastHeight = height;
    }

    window.scrollTo(0, 0);
    await sleep(500);
  };
  const clickImage = async (item) => {
    item.image.scrollIntoView({ block: "center", inline: "center" });
    await sleep(120);
    const rect = item.image.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y) || item.image;
    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
    };
    if (typeof PointerEvent !== "undefined") {
      target.dispatchEvent(new PointerEvent("pointerdown", eventOptions));
    }
    target.dispatchEvent(new MouseEvent("mousedown", eventOptions));
    if (typeof PointerEvent !== "undefined") {
      target.dispatchEvent(new PointerEvent("pointerup", eventOptions));
    }
    target.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    target.dispatchEvent(new MouseEvent("click", eventOptions));
    if (typeof target.click === "function") target.click();
  };
  const clickNext = async () => {
    const next = Array.from(document.querySelectorAll("a,button,[role='button']")).find(
      (element) => {
        const text = clean(element.textContent).toLowerCase();
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (text === "next" || text === "next page" || text === "下一页" || text === "下页")
        );
      }
    );
    if (!next) return false;
    next.scrollIntoView({ block: "center", inline: "center" });
    next.click();
    await sleep(settings.nextPageDelayMs);
    return true;
  };

  return (async () => {
    const records = [];
    const seen = new Set();
    let page = 1;

    while (records.length < settings.maxItems) {
      await preloadPageImages();
      const images = visibleGridImages();

      for (const item of images) {
        if (records.length >= settings.maxItems) break;
        if (seen.has(item.id)) continue;

        await clickImage(item);
        await sleep(settings.clickDelayMs);
        const detail = currentDetail();

        if (!detail || !detail.assetId) continue;
        if (detail.assetId !== item.id) {
          await sleep(Math.max(500, settings.clickDelayMs / 2));
        }
        const refreshed = currentDetail() || detail;
        if (!refreshed.assetId || seen.has(refreshed.assetId)) continue;

        seen.add(refreshed.assetId);
        records.push(
          Object.assign({}, refreshed, {
            thumbnail: item.src,
            page,
          })
        );
      }

      if (
        !settings.autoNextPage ||
        page >= settings.maxPages ||
        records.length >= settings.maxItems
      ) {
        break;
      }

      const moved = await clickNext();
      if (!moved) break;
      page += 1;
    }

    return records;
  })();
}

async function run() {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf("--port");
  const port =
    portIndex >= 0 && args[portIndex + 1] ? Number(args[portIndex + 1]) : 9222;
  const filteredArgs =
    portIndex >= 0
      ? args.filter((_, index) => index !== portIndex && index !== portIndex + 1)
      : args;
  const options = buildOptions(filteredArgs);
  const targets = await getJson(`http://127.0.0.1:${port}/json`);
  const target = targets.find(
    (item) =>
      item.type === "page" &&
      item.url &&
      item.url.includes("contributor.stock.adobe.com")
  );
  if (!target) {
    throw new Error("没有找到 Adobe Contributor 标签页。");
  }

  const client = createCdpClient(target.webSocketDebuggerUrl);
  try {
    await client.send("Page.bringToFront");
    await client.send("Runtime.enable");
    const expression = `(${browserScrapeFunction.toString()})(${JSON.stringify(options)})`;
    const result = await client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });

    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails, null, 2));
    }

    const records = (result.result && result.result.value) || [];
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outDir = path.join(__dirname, "output");
    fs.mkdirSync(outDir, { recursive: true });
    const jsonPath = path.join(outDir, `portfolio-${stamp}.json`);
    const csvPath = path.join(outDir, `portfolio-${stamp}.csv`);
    fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2), "utf8");
    fs.writeFileSync(csvPath, toCsv(records), "utf8");

    console.log(`采集完成：${records.length} 条`);
    console.log(`CSV: ${csvPath}`);
    console.log(`JSON: ${jsonPath}`);
  } finally {
    client.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  csvEscape,
  splitKeywords,
  parseDetailText,
  buildOptions,
};
