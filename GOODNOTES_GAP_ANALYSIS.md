# Stirling-PDF ↔ Goodnotes: Deep Research & Gap Analysis

**Date:** 2026-06-01
**Author:** Claude (Opus 4.8), cross-checked against an independent Codex (GPT-5.x) analysis
**Status:** Research / analysis only — **no implementation**. This is a strategic comparison document, not a roadmap commitment.

> **TL;DR.** Stirling-PDF and Goodnotes are *not* the same product and only overlap at the edges (both open, annotate, search and apply AI to PDFs). Stirling-PDF is a **self-hostable PDF *operations* platform** (convert / split / merge / OCR / sign / redact / automate, plus a REST API and AI orchestration). Goodnotes is a **consumer/prosumer "digital paper" + study platform** built around a low-latency stylus ink engine, a personal notebook library, cross-device sync, and on-device handwriting ML. The single largest, most expensive gap is Goodnotes' **handwriting/ink engine and notebook data model** — a second product architecture, not a feature. The defensible move for Stirling is **not** to clone Goodnotes but to borrow the ideas that reinforce PDF workflows: richer markup/review, a searchable document library, AI "ask across your documents," and study-from-PDF generation. Notably, the *current* (2024–2025) Goodnotes has expanded into PDFs, text documents, real-time collaboration and AI productivity — so the categories are slowly converging at the margins.

---

## 1. Method

- **Goodnotes** characterized from public sources (Sept 2025 product/pricing updates, support docs, engineering blog, company/funding profiles) — see [Sources](#10-sources). Goodnotes is closed-source, so all *internal* architecture statements are inferences, flagged as such.
- **Stirling-PDF** characterized from this repository (the `stag175` fork at v2.11.0) and an **independent Codex pass** over the same codebase (read-only). Codex's file-level citations are reproduced where they substantiate a claim.
- The two AI analyses (Claude + Codex) were produced independently and then reconciled — see [§9 Claude-vs-Codex comparison](#9-comparing-the-two-analyses-claude-vs-codex).

---

## 2. Deep research: what Goodnotes actually is (2026)

### 2.1 Company & market context
- **Founded 2011** by **Steven Chan** in **Hong Kong**; bootstrapped for years on the strength of its in-house digital-ink tech.
- **$6M seed** in June 2020 (Race Capital the sole institutional investor) — the transition from indie app to VC-backed company.
- Reached a **$1B valuation in 2024**, reportedly **>$50M revenue** and ~20% user growth, **24–25M+ users**.
- **Acquired Dropthebit** (a Korean AI startup) in Jan 2024 and invested in WeBudding — explicitly to accelerate the AI/handwriting roadmap.
- Positioning: education + prosumer productivity ("your best ideas, handwritten").

### 2.2 Platforms
- **Full experience:** iPadOS / iOS / macOS (Apple-Pencil-first; the iPad is the flagship surface).
- **Reduced experience:** Android (tablets/Chromebooks), Windows, and **Web** — these can view/sync the library and do a subset of editing; feature parity with iPad is *explicitly* incomplete.
- **Sync:** "Goodnotes Cloud" syncs the library across platforms; you can **log in with an Apple ID** even on Android/Windows/Web.

### 2.3 Core product surface
- **Stylus-first handwriting** — the heart of the product. Apple Pencil behaviors (squeeze, barrel-roll, hover, double-tap, Scribble) and Goodnotes gestures (**circle-to-lasso**, **scribble-to-erase**), palm rejection, pressure/tilt, editable vector strokes.
- **Document types (post-2024 "new Goodnotes" redesign):**
  - **Notebooks** (paper templates, covers, the classic experience).
  - **Whiteboards** — infinite canvas for diagrams/mind-maps, with a Shapes tool.
  - **Text documents** — "frictionless typing" with headings, lists, tables, image/video embeds.
- **Import & markup:** PDF, images, Word/PowerPoint/Excel, Apple iWork, Goodnotes backups — Office/iWork imports are converted to PDF-like note documents (you annotate, not natively edit Office).
- **Handwriting recognition & search** across handwritten notes, typed text, PDF text, titles, folders and outlines.
- **Audio notes** recorded and synchronized to the note timeline.
- **Organization:** folders, favorites, custom templates, covers, stickers.
- **Marketplace** (since April 2023): third-party digital stationery — planners, paper templates, covers, stickers (incl. licensed collections). Creators apply and sell; Goodnotes takes a cut.

### 2.4 AI features ("Goodnotes AI" / "Ask Goodnotes")
- **Ask Goodnotes:** RAG-style Q&A over *your own* notes/PDFs — summaries, concept clarification, **interactive quiz / flashcard generation**, with references back to source.
- **AI for Math:** recognizes handwritten equations; **Solve** and **Teach me** quick actions; can flag an incorrectly worked problem.
- **AI for Meetings (new):** records, transcribes and summarizes meetings with live summaries.
- **On-device handwriting AI ("Smart Ink"):** in-house proprietary models for **spellcheck** and **word-complete in your own handwriting style**, plus reflow/align/copy-paste of ink. Goodnotes states these run **entirely on-device** (>95% accuracy at a model size small enough to ship locally), with handwriting data **not leaving the device** — a deliberate privacy stance.
- **AI template/draft generation** to beat blank-page syndrome.

### 2.5 Business model & tiers (Sept 2025 onward)
- **Hybrid freemium.** Free tier ≈ 3 editable notebooks.
- **Goodnotes Essential** (annual) — core AI features.
- **Goodnotes Pro** (annual) — advanced collaboration + the full AI toolset.
- **AI Pass** (monthly add-on) — "12× more credits."
- **Special Edition** — a **one-time Apple-only** purchase (legacy "buy it once" model).
- **Goodnotes Teams / Business** — moved from device-based to **account-based at ~US$10/user/month** (annual) in June 2025, with an Admin Console.
- Historical consumer price points seen in 2025: ~$9.99/yr or ~$29.99 one-time (Apple).

### 2.6 Collaboration (materially upgraded in the redesign)
- **Real-time collaborative sessions** across document types with **presence indicators and comments**. Pro can privately share; Essential shares via public links. *(This is newer than many third-party write-ups suggest and is important for the gap analysis — see §9.)*

### 2.7 Inferred architecture (closed-source — treat as hypothesis)
A Goodnotes-class product implies: a **low-latency ink canvas** (per-page editable vector strokes layered above any imported PDF), a **durable notebook/page/stroke/media domain model**, **incremental search indexes** (handwriting + typed + PDF text), **cross-device sync with offline + conflict resolution**, a **cloud account system**, **on-device ML** for handwriting/OCR, and now **real-time collaboration infra** (CRDT/OT-style). None of this is published; it is inferred from observable behavior.

---

## 3. What Stirling-PDF actually is (evidence from this repo)

Stirling-PDF (this fork) is an **open-core PDF *platform***, not a static utility set:

- **Backend:** Spring Boot 4.0.6, **Java/JDK 25**, Jackson 3, **PDFBox 3.0.7**, Jetty, OpenAPI/SpringDoc. Module scan over `app/core`, `app/common`, `app/proprietary`, `app/saas` with runtime profile detection (`SPDFApplication.java`).
- **Tool/endpoint registry:** `EndpointConfiguration.java` groups PageOps, Convert, Security, Misc/Advanced, Automation; OpenAPI discovery via `ApiDocService`.
- **Frontend:** Vite + React + TypeScript + **Mantine** (+ Tailwind), layered `core`/`proprietary`/`saas`/`desktop` source trees. The PDF workbench is built on **`@embedpdf/*`** plugins + **PDF.js / PDFium**. Centralized `FileContext` with **IndexedDB** persistence, blob lifecycle, thumbnail caching.
- **AI engine:** a typed **FastAPI / pydantic-ai** reasoning service (`engine/`) with an **orchestrator** plus PDF **edit / question / review / comment / math** agents and **RAG** backends (SQLite or **pgvector**). Per repo design, the engine *plans/interprets* and does not own durable state or execute Stirling ops directly — Java injects the enabled endpoint set.
- **Desktop:** **Tauri** shell that bundles/launches the Java backend JAR locally, with file associations.

**Real operation surface (50+ tools):**
- **Page ops:** merge, split, remove/rearrange, rotate, crop, scale, booklet/poster imposition, multi-page layout, page numbers, overlay.
- **Conversion:** PDF↔image, Office↔PDF, PDF→Word/PowerPoint/text/XML/HTML/CSV/Markdown/EPUB/CBZ/vector/video, URL/HTML/Markdown/email/ebook→PDF, **PDF/A**.
- **Security/signing:** password add/remove, permissions, watermark, **certificate signing + validation + timestamping**, sanitize, **redaction/auto-redaction**, verify PDF.
- **Forms:** field discovery, coordinate extraction, CSV/XLSX extraction, modify/delete/fill (frontend currently fill-focused).
- **Analysis:** page count, properties, dimensions, form fields, annotations, fonts, security.
- **Misc/advanced:** OCR, compress, repair, flatten, metadata, remove blanks/annotations, extract images, attachments, auto-rename, scanner effect, color replacement, JavaScript inspection.
- **Automation/jobs:** auto-job wrapper, async job tracking/result endpoints, pipeline/automation category, **REST + OpenAPI** for scripting/integration.
- **Proprietary layer:** user file storage, **folders**, **share links**, **signing sessions** (multi-participant), AI orchestration proxy.

**Deployment / audience:** self-hosted web app, **Docker**, **private API**, Tauri desktop, plus proprietary/SaaS modules; enterprise posture (security mode, SSO/audit). Audience = developers, IT/ops, privacy-conscious orgs, and end users needing PDF transformation — *not* tablet note-takers.

---

## 4. Positioning: are they even competitors?

**Mostly no — they are adjacent, not overlapping.** They intersect only where both can *open a PDF, annotate it, search it, and run AI over it*. Everything else diverges:

- Stirling's mental model: **"files flow through tools / APIs / jobs."** PDFs are **inputs & outputs**.
- Goodnotes' mental model: **"a personal library of living notebooks you write in forever."** PDFs are **imported paper you mark up and study**.

Better true peers:
- **Stirling-PDF** ≈ Adobe Acrobat (tooling/server), PDF24, iLovePDF/Smallpdf, plus signing tools like Documenso/DocuSeal.
- **Goodnotes** ≈ Notability, OneNote, Nebo, Apple Notes (+ markup), Samsung Notes.

**Caveat (convergence):** the 2024–2025 Goodnotes pushed into **PDFs, typed text documents, AI productivity, meetings, and real-time collaboration** — i.e. *toward* general document/productivity territory. So while they are not competitors today, the edges are widening. Stirling's wedge (self-hostable, API-driven, privacy-friendly PDF automation) remains distinct, but "AI over your documents" is a space both are now entering from opposite ends.

---

## 5. Feature-by-feature comparison

| Dimension | Stirling-PDF (this repo) | Goodnotes 6 (2026) | Gap / winner |
|---|---|---|---|
| **Primary job** | PDF processing/automation platform | Digital paper + study/productivity workspace | Different categories |
| **Deployment** | Self-host, Docker, private API, Tauri desktop, SaaS | Native apps (Apple-first) + Android/Win/Web + cloud sync | Stirling wins on-prem; Goodnotes wins consumer mobile |
| **PDF op breadth** | Very broad (convert/split/merge/OCR/compress/repair/forms/security) | Import/annotate/export only | **Stirling far ahead** |
| **Viewer/editor** | embedpdf workbench (annotate, redact, search, thumbnails, bookmarks, export, print, history) | Notebook-first reader with writing tools, templates | Stirling has primitives; Goodnotes has notebook UX |
| **Handwriting / ink engine** | PDF ink annotations only; no pressure/tilt/palm-rejection notebook engine | **Core competency** — low-latency editable ink, gestures, recognition | **Goodnotes far ahead** |
| **Notebook / page / stroke model** | File-centric (IndexedDB + proprietary folders) | Notebooks/pages/strokes/media/templates/covers | **Goodnotes far ahead** |
| **Handwriting recognition & search** | OCR endpoint + viewer text search + RAG | On-device handwriting recognition, library-wide search | Goodnotes ahead (stroke-level) |
| **AI** | Tool-orchestration: edit/question/review/comment/math agents, RAG, endpoint injection | Ask-notes, summaries, quizzes, math, meetings, on-device handwriting AI | Different focus (ops vs study) |
| **Study tools** | None native (AI could generate) | Flashcards, quizzes, spaced study | Goodnotes wins |
| **Audio notes** | None | Audio synced to note timeline | Goodnotes only |
| **Forms (AcroForm)** | Discover/extract/modify/delete/fill | Write on PDFs only | **Stirling wins** |
| **Signing / security** | Passwords, cert sign+validate, timestamp, redact, sanitize, signing sessions | Handwritten signatures/markup only | **Stirling wins** |
| **Collaboration** | Share links, multi-party signing sessions (workflow) | **Real-time co-editing + presence + comments** | Goodnotes wins live notes; Stirling wins signing workflow |
| **Automation / API** | First-class REST + OpenAPI + async jobs | Not a product focus | **Stirling far ahead** |
| **Enterprise / admin** | Security mode, SSO/audit, on-prem | Teams/Business + Admin Console (SaaS) | Stirling wins on-prem; Goodnotes wins managed SaaS |
| **Marketplace / content** | None (stamps/watermarks only) | Digital stationery marketplace | Goodnotes wins |
| **Business model** | Open-core / self-host / Docker / API / SaaS modules | Freemium + annual + one-time + AI add-on + Teams | Different GTM |
| **Privacy stance** | Self-hostable, data stays on your server | On-device handwriting ML; cloud for the rest | Both privacy-forward, different mechanism |

---

## 6. Capabilities Goodnotes has that Stirling-PDF lacks (ranked by impact × effort)

| # | Capability | Impact | Effort | Why it matters |
|--:|---|---|---|---|
| 1 | **Stylus-first handwriting engine** | Very high | Very high | Goodnotes' identity: low-latency editable ink, Apple-Pencil behaviors, gestures, pressure/tilt, palm rejection. A new canvas architecture, not "more annotation buttons." |
| 2 | **Notebook/page/stroke data model** | Very high | Very high | Stirling is "files through tools"; Goodnotes is "notebooks of pages/strokes/media/text/templates/audio + derived search data." |
| 3 | **Handwriting recognition + handwritten search** | High | High | On-device, library-wide. Stirling has PDF OCR + viewer search, not stroke-level handwriting indexing. |
| 4 | **Cross-device sync (offline + conflict resolution)** | High | Very high | Goodnotes Cloud is central. Stirling has share links/storage, not multi-device notebook sync. |
| 5 | **Native tablet app quality** | High | Very high | Goodnotes is iPad-first. A browser/Tauri app can't match native stylus ergonomics without a separate native build. |
| 6 | **Real-time collaborative editing + presence** | Medium-high | High | New Goodnotes has live co-editing. Stirling sharing is workflow/signing-oriented; no CRDT/OT stroke sync. |
| 7 | **Audio notes synced to the page/ink timeline** | Medium-high | Medium-high | Stirling has no temporal note model to attach audio to. |
| 8 | **Study sets / flashcards / quizzes / spaced repetition** | Medium-high | Medium | Domain is missing, though Stirling's AI could *generate* artifacts from PDFs. |
| 9 | **Deep in-note AI UX (ask-my-library)** | Medium-high | Medium-high | Goodnotes AI is embedded in the note/study loop with citations; Stirling AI is operation-centric. |
| 10 | **Content marketplace (stationery/templates/stickers)** | Medium | Medium | An ecosystem/business feature; Stirling has only narrow PDF stamps/watermarks. |
| 11 | **Whiteboard / infinite canvas + structured text docs** | Medium | Medium-high | New Goodnotes document types; outside Stirling's PDF-centric model. |
| 12 | **On-device ML for privacy-preserving features** | Medium | High | Goodnotes ships small on-device models; Stirling's "privacy" is self-hosting, not local ML. |

---

## 7. Capabilities Stirling-PDF has that Goodnotes lacks

Stirling is **dramatically stronger** at server-grade PDF work:

1. **Batch PDF transformation** — merge/split/rearrange/crop/scale/booklet/poster/overlay/page-numbers/repair/compress.
2. **Broad conversion matrix** — Office↔PDF, image↔PDF, PDF/A, PDF→Word/PPT/text/XML/HTML/CSV/MD/EPUB/CBZ/vector/video, URL/HTML/MD/email/ebook→PDF.
3. **PDF security & compliance** — passwords, permissions, **certificate signatures + validation + timestamping**, sanitize, redaction, watermarking, verify PDF.
4. **AcroForm + structured-data extraction** — field discovery, coordinates, CSV/XLSX extraction, modify/delete/fill.
5. **REST/OpenAPI automation + async jobs** — Stirling can be *infrastructure*, scripted and integrated, not just used interactively.
6. **Self-hosted / private / on-prem** — Docker, local desktop backend, enterprise security posture; data never leaves your environment.
7. **Tool-orchestration AI** — the engine selects structured delegates for PDF edit/question/review/comment/math, with the Java layer injecting the enabled endpoint set (server-trusted, not client-trusted).
8. **A deep PDF dependency ecosystem** — PDFBox, LibreOffice/unoconvert, OCRmyPDF/Tesseract, Ghostscript, qpdf, ImageMagick, Calibre, WeasyPrint, veraPDF, modeled as endpoint dependency groups.

Goodnotes can import/annotate/export/search PDFs — but it is **not** a self-hosted PDF conversion/security/forms automation platform.

---

## 8. Architecture & technical gaps

1. **Ink/stroke rendering.** Stirling's embedpdf layer supports PDF ink + annotation subtypes — enough for *markup*, not a Goodnotes ink engine. A real one needs low-latency capture; pressure/tilt/azimuth/hover/eraser/lasso/palm-rejection; stroke smoothing + editable vector ink; per-page stroke layers independent of the flattened PDF; gesture semantics; platform pencil APIs.
2. **Storage / library model.** Stirling has IndexedDB files + optional proprietary folders/share links. A notebook product needs notebooks/folders/pages/templates/covers; strokes/text/images/stickers/audio/imported-PDF page refs; per-page revision history; search indexes; sync metadata + conflict resolution.
3. **Sync / collaboration.** Stirling has share links + signing sessions (document-workflow collaboration). Goodnotes-style needs near-real-time shared *content* editing, offline edits + conflict handling, presence/state propagation across Apple/Android/Windows/Web — i.e. CRDT/OT + stroke-level event sync, which the repo doesn't have.
4. **Mobile / stylus input.** Stirling is Tauri desktop + browser (it does expose a mobile *scanner* API). A Goodnotes competitor needs native iPadOS (likely Android tablet) apps, app-store distribution, deep stylus APIs, offline-first storage + background sync. A responsive web/Tauri app is not parity.
5. **OCR / ML / search.** Stirling has OCR endpoints + RAG (SQLite/pgvector) — strong for *document reasoning*. Goodnotes' differentiator is **handwriting** recognition + note-library search: ML over strokes/rendered pages, incremental indexing, handwriting-tuned models, instant searchability.
6. **AI product integration.** Stirling's AI is architecturally sound (Java proxy → Python engine, endpoint injection, streamed orchestration, results mapped into file workflows). But Goodnotes AI lives *inside* the note loop (ask-notes/summarize/quiz/math/spellcheck/autocomplete). Stirling can win "AI document operations"; it can't claim "AI digital paper" without the notebook/handwriting/audio/study domains.
7. **Interaction model.** Stirling = tool workbench (file in → configure op → preview/import/download; multi-tool chains like split→merge→compress→view). Goodnotes = continuous writing surface + library (open → write → search → study → record → sync). **This is a product-model gap, not a styling gap.**

---

## 9. Comparing the two analyses (Claude vs Codex)

The user asked for both Claude's and Codex's perspectives. They were produced independently and **agree on every major conclusion**; they differ mainly in *depth of evidence* vs *currency of product facts*. This complementarity is the point: Codex grounded the *Stirling* side in file-level repo evidence; Claude grounded the *Goodnotes* side in current (2025–26) product/market research.

### 9.1 Where they fully agree (high confidence)
- Stirling and Goodnotes are **different product categories**, overlapping only on open/annotate/search/AI-over-PDF.
- The **#1 gap is the handwriting/ink engine**, and the **#2 gap is the notebook/page/stroke data model** — both are *architectures*, not features.
- Sync/collaboration, native tablet/stylus quality, audio notes, study tools, and marketplace are all Goodnotes-side gaps.
- Stirling decisively wins PDF ops, conversion, security/signing, forms, REST/automation, and self-hosting.
- **Same strategic recommendation:** do **not** clone Goodnotes; instead borrow the adjacent ideas that reinforce PDF workflows — better markup/review, a searchable document library, AI "ask across documents," study-from-PDF, templates/stamps packs.

### 9.2 Where they differ
| Topic | Codex's emphasis | Claude's emphasis | Reconciliation |
|---|---|---|---|
| **Goodnotes collaboration** | Framed as "shared documents/folders, not clearly real-time" | Research shows the **new Goodnotes added real-time co-editing + presence + comments** | **Claude's is more current.** Codex was conservative without web data; the live-collab gap is therefore *larger* than Codex implied. |
| **Goodnotes product scope** | Notebooks/study/handwriting + PDF import | Adds **whiteboards, typed text docs, AI-for-Meetings, AI template generation** (2024–25 redesign) | Goodnotes is broader and **moving toward general document/AI productivity** — edges converge with Stirling over time. |
| **Evidence depth (Stirling)** | **Deep** — exact files/lines (`EndpointConfiguration.java`, `AiEngineController.java`, `FileContext.tsx`, etc.) | Higher-level repo summary | Codex's file-level citations are the authoritative substantiation; adopted in §3. |
| **Company/market context** | Not covered | $1B valuation, 25M users, on-device "Smart Ink" >95% accuracy, pricing tiers, Dropthebit acquisition | Claude adds the business/tech context Codex lacked without web access. |
| **On-device ML** | Noted ML is needed for handwriting search | Confirms Goodnotes **ships on-device models** (privacy: handwriting never leaves device) | Sharpens the "privacy" comparison: Goodnotes = on-device ML; Stirling = self-hosting. |

### 9.3 Net
Neither analysis contradicts the other; **Claude's web research updates and widens a few Goodnotes-side gaps that Codex (offline) under-stated, and Codex's repo dive hardens the Stirling-side evidence.** Combined confidence in the conclusions is high.

---

## 10. Strategic assessment (recommendations — not a commitment)

### Worth pursuing (fits the existing architecture; reinforces the PDF wedge)
1. **Best-in-class PDF reader/markup mode.** Build on the existing embedpdf annotation/redaction/search/bookmark/signature plumbing: persistent annotations, a review/comments sidebar, highlighter/stamp/signature UX, stylus-friendly toolbar, export/flatten controls, stronger mobile-web ergonomics.
2. **Document library with search + AI recall.** Promote `FileContext` + IndexedDB + proprietary storage/folders + the Python RAG engine into a real "PDF/document workspace": durable records, server-side indexing, OCR status, full-text + annotation search, **"ask across your library"** with citations, permission-aware retrieval. *(Frame as a document workspace, not a notebook app.)*
3. **AI PDF copilot.** Already aligned with the repo. Highest value is *operational*: "do X to this batch," "summarize this filing," "find & redact sensitive data," "extract these tables," "convert/clean/compress/sign these." Invest in tool-result verification, a durable workflow ledger, safer planning, richer chat/result import.
4. **Study-lite for PDFs.** Without becoming Goodnotes: generate flashcards/quizzes from PDFs, summarize chapters, explain selected text, export study packs — leveraging selection/highlight capture + AI endpoints.
5. **Templates / stamps / forms packs.** A modest content layer that fits Stirling: reusable stamps, watermarks, signature appearances, form-field presets, redaction policies, workflow templates (a marketplace only if the SaaS business justifies it).

### Out of scope (would require a *second* product architecture)
- A full Goodnotes clone; native iPad handwriting parity; a consumer notebook marketplace as the core business; real-time collaborative *handwritten* notebooks; full handwritten OCR/search over editable strokes; audio-note timeline sync as a flagship.

### The clean strategic line
**Borrow Goodnotes' ideas where they reinforce PDF workflows; do not reposition as "digital paper."** Stirling's defensible, *stronger* wedge is privacy-friendly, self-hostable, API-driven PDF automation with an increasingly capable browser/desktop workbench and AI orchestration layer. Goodnotes owns the handwritten notebook/study surface; Stirling can own the **document operations & PDF workflow platform** — and meet Goodnotes only in the shared, growing middle of "AI over your documents."

---

## 11. Sources

**Goodnotes — product & features**
- [Introducing Goodnotes 6 (blog)](https://www.goodnotes.com/blog/introducing-goodnotes-6)
- [Meet the New Generation of Goodnotes: Whiteboards, Text Documents, AI (blog)](https://www.goodnotes.com/blog/the-new-goodnotes)
- [Goodnotes Elevates Productivity for its 24M+ Users (PR Newswire)](https://www.prnewswire.com/news-releases/goodnotes-elevates-productivity-for-its-24m-users-with-new-ai-powered-enhancements-302267107.html)
- [Ask Goodnotes (feature page)](https://www.goodnotes.com/features/ask-goodnotes)
- [Audio Notes (feature page)](https://www.goodnotes.com/features/audio-notes)
- [Import files into Goodnotes 6 (support)](https://support.goodnotes.com/hc/en-us/articles/360001571256-Importing-files-into-Goodnotes-6)
- [Search your notes and documents (support)](https://support.goodnotes.com/hc/en-us/articles/360000633255-Search-your-notes-and-documents)
- [Using Apple Pencil with Goodnotes 6 (support)](https://support.goodnotes.com/hc/en-us/articles/10277366719759-Using-Apple-Pencil-with-Goodnotes-6)
- [Share documents/folders for collaboration (support)](https://support.goodnotes.com/hc/en-us/articles/360000692956-Share-documents-or-a-folder-of-documents-for-collaboration)

**Goodnotes — platforms & sync**
- [Goodnotes for Android, Windows, and Web — FAQs (support)](https://support.goodnotes.com/hc/en-us/articles/7378735557519-Goodnotes-for-Android-Windows-and-Web-General-FAQs)
- [Goodnotes System Requirements (support)](https://support.goodnotes.com/hc/en-us/articles/7353717662735-Goodnotes-System-Requirements)
- [Goodnotes goes cross-platform: Android, Windows, Web (blog)](https://www.goodnotes.com/blog/goodnotes-android-windows-web)
- [Goodnotes for Web](https://www.goodnotes.com/web) · [Goodnotes for Android](https://www.goodnotes.com/android)

**Goodnotes — AI & handwriting tech**
- [Behind the Scenes: Shipping Handwriting Recognition (engineering blog)](https://www.goodnotes.com/blog/machine-learning-engineer-handwriting-recognition)
- [Goodnotes is using AI to make studying easier (Fortune Education)](https://fortune.com/education/articles/goodnotes-ai-note-taking-app-education-research/)
- [A guide to Goodnotes AI (support)](https://support.goodnotes.com/hc/en-us/articles/10779112528399-A-guide-to-Goodnotes-AI)

**Goodnotes — pricing, marketplace, company**
- [Goodnotes Pricing](https://www.goodnotes.com/pricing) · [Introducing Our New Payment Plans (support)](https://support.goodnotes.com/hc/en-us/articles/13808767840015-Introducing-Our-New-Payment-Plans)
- [Admin Console for Business Customers (blog)](https://www.goodnotes.com/blog/introducing-admin-console-for-business-customers)
- [Getting Started with the Marketplace (support)](https://support.goodnotes.com/hc/en-us/articles/7353727452175-Getting-Started-with-the-Marketplace) · [Goodnotes Marketplace](https://marketplace.goodnotes.com/en/)
- [Goodnotes — PitchBook profile](https://pitchbook.com/profiles/company/454789-63) · [Goodnotes — Crunchbase](https://www.crunchbase.com/organization/goodnotes)

**Stirling-PDF** — this repository (`stag175/Stirling-PDF` fork @ v2.11.0): `README.md`, `AGENTS.md`, `UPGRADE_ROADMAP.md`, `build.gradle`, `app/common/.../config/EndpointConfiguration.java`, `app/common/.../service/ApiDocService.java`, `app/core/.../SPDFApplication.java`, `app/core/.../controller/api/**`, `app/proprietary/.../web/**`, `frontend/package.json`, `frontend/editor/src/core/contexts/FileContext.tsx`, `frontend/editor/src/core/components/viewer/**`, `engine/**`, `frontend/editor/src-tauri/**`. File-level citations contributed by the independent Codex pass.
