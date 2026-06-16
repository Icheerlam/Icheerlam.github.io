---
name: adobe-stock-portfolio-optimizer
description: Use when working with Adobe Stock contributor portfolios, scraping Contributor metadata, building a local duplicate-avoidance database, auditing keyword batches, or generating Adobe Stock prompts, titles, and keywords that must avoid similarity with an existing portfolio.
---

# Adobe Stock Portfolio Optimizer

## Overview

Use this skill to maintain a local memory of an Adobe Stock Contributor portfolio, then generate new prompts, titles, and keyword sets that avoid obvious similarity with uploaded assets and previous candidate batches.

Core rule: extract or locate the portfolio database first, verify it, generate candidates against that memory, audit the batch, revise risky rows, then sync and optionally copy the final range to the clipboard.

## Default Files

In the user's Obsidian vault, prefer these paths:

```text
adobe-stock-tools/output/portfolio-latest.csv
adobe-stock-tools/output/portfolio-latest.json
Adobe Stock 避重图库数据库.md
Adobe Stock 60组避重图片关键词.md
```

Skill scripts live here:

```text
C:\Users\ycl\.codex\skills\adobe-stock-portfolio-optimizer\scripts\
```

## End-to-End Workflow

1. Locate `portfolio-latest.csv` and verify counts.
2. If missing or stale, refresh it from Adobe Contributor using the browser/CDP scraper.
3. Inspect high-frequency categories and keywords before generating.
4. Generate numbered candidate lines into the Obsidian keyword note.
5. Audit the new range against:
   - Adobe uploaded portfolio.
   - Earlier candidate lines.
   - The new batch internally.
   - Required constraints such as `no people` and `no text`.
6. Revise all high-risk rows and any medium-risk rows that are only minor variants.
7. Re-run checks until the target result is zero high risk and, when possible, zero medium risk.
8. Copy the final batch to the clipboard when the user asks or when previous workflow implies direct use.

## Browser Portfolio Extraction

Adobe Contributor usually has no export button. Use Chrome remote debugging and the bundled CDP scraper. Never ask for, store, or automate Adobe credentials. The user must log in manually.

Launch a dedicated Chrome session:

```powershell
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList @(
  "--remote-debugging-port=9222",
  "--user-data-dir=$env:TEMP\adobe-stock-extractor-chrome-profile",
  "https://contributor.stock.adobe.com/"
)
```

Ask the user to open the Contributor page that shows uploaded files/portfolio thumbnails. If detail metadata appears only after clicking a thumbnail, that is expected; the scraper clicks thumbnails and reads the detail panel.

Confirm CDP is available:

```powershell
Invoke-RestMethod "http://127.0.0.1:9222/json/version"
```

Run the scraper:

```powershell
node "C:\Users\ycl\.codex\skills\adobe-stock-portfolio-optimizer\scripts\portfolio-cdp-scraper.js" `
  --maxItems 2200 `
  --autoNextPage `
  --maxPages 22 `
  --clickDelayMs 650 `
  --nextPageDelayMs 3000
```

If the portfolio grows, increase `--maxItems` and `--maxPages`. The scraper extracts fields such as file ID, dimensions, format, upload date, title, category, language, keywords, downloads, and source page.

Save final CSV/JSON in the vault:

```text
adobe-stock-tools/output/portfolio-latest.csv
adobe-stock-tools/output/portfolio-latest.json
```

Verify extraction before saying it succeeded:

```powershell
$csv = "adobe-stock-tools/output/portfolio-latest.csv"
$rows = Import-Csv -LiteralPath $csv
$dupes = $rows | Group-Object asset_id | Where-Object Count -gt 1
$emptyTitles = $rows | Where-Object { [string]::IsNullOrWhiteSpace($_.title) }
$emptyKeywords = $rows | Where-Object { [string]::IsNullOrWhiteSpace($_.keywords) }
[pscustomobject]@{
  Total = $rows.Count
  DuplicateAssetIds = $dupes.Count
  EmptyTitles = $emptyTitles.Count
  EmptyKeywords = $emptyKeywords.Count
}
```

Also confirm page distribution when pagination was used, especially that the final page count matches Adobe's visible total.

## Obsidian Sync

When working in an Obsidian vault:

- Keep the latest CSV/JSON under `adobe-stock-tools/output/`.
- Maintain `Adobe Stock 避重图库数据库.md` as the entry note.
- Link the CSV/JSON from the note.
- Include extraction date, total row count, duplicate ID count, empty title/keyword count, main categories, high-frequency keywords, and usage notes.
- Do not say "synced to Obsidian" unless files were actually written and verified.

## Portfolio Context Scan

Before generating a new batch, summarize the crowded areas:

```powershell
$csv = "adobe-stock-tools/output/portfolio-latest.csv"
$rows = Import-Csv -LiteralPath $csv
$terms = @{}
foreach ($r in $rows) {
  foreach ($k in (($r.keywords -split ',') | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })) {
    $terms[$k] = 1 + ($terms[$k] -as [int])
  }
}
$terms.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 40
```

Treat high-frequency themes as crowded unless the user explicitly requests them. In this user's portfolio, be especially cautious with broad interior/home terms such as `interior design`, `home decor`, `living room`, `sofa`, `window`, `light`, `chair`, and generic `nature`/`animal` wording.

## Candidate Generation Rules

Use numbered one-line entries by default:

```text
1. 中文方向：english keyword, english keyword, english keyword...
```

For Adobe Stock:

- Prefer English keywords after the Chinese direction label.
- Put the most important 10 keywords first.
- Use concrete, searchable terms.
- Use 10-25 accurate keywords unless the user asks otherwise.
- Avoid keyword stuffing and unrelated search terms.
- Avoid minor variants: color swaps, crop changes, angle changes, or the same object in nearly the same use case.
- When continuing an existing note, inspect the last number and append the next range.

If the user asks for no people:

- Include `no people` in every candidate line.
- Avoid body parts, silhouettes, portraits, crowds, mannequins, or person-like subjects unless explicitly allowed.

If the user asks for no text:

- Include `no text` in every candidate line.
- Avoid signs, labels, forms, documents, books, screens, dashboards, diagrams, charts, menus, packaging fronts, brand marks, clocks with numerals, maps with place names, and anything likely to generate letters or numbers.
- Prefer textures, materials, abstract backgrounds, unlabeled objects, blank mockups, natural details, or pure geometry.

## Similarity Risk Rules

Treat as high risk:

- Front 10 keyword overlap is 5 or more.
- Total keyword overlap ratio is 50% or more.
- Title words overlap heavily and the subject/use case is the same.
- The idea is only a color, crop, background, camera angle, or season variant of an old idea.

Treat as medium risk:

- Front 10 keyword overlap is 3-4.
- Total keyword overlap ratio is 30-49%.
- The concept sits in a crowded theme from the user's portfolio.

Low-risk candidates should differ in at least two of:

- Subject.
- Buyer intent.
- Commercial use case.
- Setting/context.
- Object set.
- Output format, such as photo, 3D render, PNG cutout, material texture, or blank mockup.

## Batch Audit Commands

For a full candidate file against the Adobe portfolio:

```powershell
node "C:\Users\ycl\.codex\skills\adobe-stock-portfolio-optimizer\scripts\check-keyword-overlap.js" `
  "adobe-stock-tools/output/portfolio-latest.csv" `
  "Adobe Stock 60组避重图片关键词.md"
```

For a specific new numbered batch, use the batch auditor:

```powershell
node "C:\Users\ycl\.codex\skills\adobe-stock-portfolio-optimizer\scripts\audit-keyword-batch.js" `
  --portfolio "adobe-stock-tools/output/portfolio-latest.csv" `
  --candidates "Adobe Stock 60组避重图片关键词.md" `
  --from 1121 `
  --to 1220 `
  --require "no people,no text"
```

The batch auditor reports:

- Missing required terms.
- Portfolio high/medium risks.
- Similarity with previous candidate lines.
- Similarity inside the new batch.

It ignores constraint words like `no people`, `no text`, `blank`, `plain`, and `unlabeled` during candidate-vs-candidate similarity because those are compliance terms, not visual concepts.

Target before finalizing:

```text
Missing required terms: 0
Portfolio high risk: 0
Portfolio medium risk: 0
Previous-candidate similar hits: 0
In-batch similar pairs: 0
```

If Adobe portfolio medium risk is not zero, keep it only when the new concept is materially different from the matched old asset; otherwise revise.

## Revision Loop

When checks find risk:

1. Read the matched old title and overlap numbers.
2. Replace the risky candidate with a different subject/use case, not a synonym rewrite.
3. Keep the original numbering.
4. Re-run the same audit command.
5. Repeat until clean.

For no-text batches, do not "fix" a risky row by adding signs, labels, books, documents, screens, or brand-like objects.

## Clipboard Copy

After a batch is clean, copy only the requested range:

```powershell
$from = 1121
$to = 1220
$file = "Adobe Stock 60组避重图片关键词.md"
$content = Get-Content -LiteralPath $file -Encoding UTF8 | Where-Object {
  if ($_ -match '^(\d+)\. ') {
    $n = [int]$Matches[1]
    $n -ge $from -and $n -le $to
  }
}
$text = $content -join [Environment]::NewLine
for ($i = 1; $i -le 10; $i++) {
  try {
    Set-Clipboard -Value $text
    break
  } catch {
    Start-Sleep -Milliseconds 300
  }
}
$clipLines = (Get-Clipboard -Raw) -split "`r?`n" | Where-Object {
  if ($_ -match '^(\d+)\. ') {
    $n = [int]$Matches[1]
    $n -ge $from -and $n -le $to
  }
}
[pscustomobject]@{
  SourceLines = $content.Count
  ClipboardLines = $clipLines.Count
  First = ($clipLines | Select-Object -First 1)
  Last = ($clipLines | Select-Object -Last 1)
}
```

If `Set-Clipboard` fails because the clipboard is busy, retry or fall back to `clip.exe`, then read back with `Get-Clipboard -Raw`.

## Common Mistakes

- Generating from memory when `portfolio-latest.csv` exists.
- Checking only the Adobe portfolio but not previous generated batches.
- Counting `no people` / `no text` as visual similarity; use the batch auditor instead.
- Using broad high-frequency keywords as the core idea without a distinct commercial use case.
- Creating many variations of the same object with only material/color/angle changes.
- Forgetting to verify the last number before appending.
- Claiming clipboard copy succeeded without reading back the line count.
- Running the scraper against normal Chrome without `--remote-debugging-port=9222`.
- Scraping credentials, cookies, or login fields. Do not do this.
