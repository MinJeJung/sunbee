---
name: new-ebook-publish
description: EPUB-first Korean ebook publishing pipeline for Sunbee Books. Use when the user invokes /new-ebook-publish, asks to make a book from a topic through /book, wants Korean book cover generation, EPUB quality review, ISBN application, or 5-platform ebook distribution as one coordinated Codex team workflow with per-book threads, final content-quality gates, a mandatory human quality review between production and distribution (Codex approval primary, Slack notification auxiliary), cover metaphor deduplication, and an EPUB-centered Obsidian dashboard.
---

# /new-ebook-publish

## 2026-08-01 Active Production Contract

This contract overrides older character-count gates in this document.

1. Required intake is target reader, reader problem, source links, and desired outcome; recommended outline is optional.
2. Generate a SOL brief and wait for plan approval before writing: title, promise, differentiation, book type, recommended length band, chapter deliverables, source plan, and promised reader assets.
3. Length bands are warnings only: quick 40,000–60,000, standard 60,000–90,000, deep 90,000–120,000 Korean-visible characters.
4. Every section needs at least four of five content units: new insight, evidence, Korean example, reader action, asset or failure case.
5. Score promise resolution 25, new information 20, source accuracy 15, actionability 20, Korean prose 10, differentiation/repetition 10. Pass at 85 with no hard blocker.
6. Hard blockers: unsourced changing facts, unlabeled synthetic cases, tone mismatch, repeated structure, missing promised assets, and internal markers.
7. Draft one representative section first. Full drafting starts only after its quality check.
8. Run evidence, actionability, repetition, compression, mobile EPUB, and final human approval gates in that order.
9. Batch plans may be generated together, but approved books are produced sequentially by row. Do not run multiple books from the same batch concurrently.
10. Preserve an existing cover unless the user explicitly asks for a cover change.

Run a complete EPUB-first publishing workflow from topic to 5-platform distribution. This skill is a coordinator; reuse existing local skills and automation instead of duplicating them:

- `/book` for manuscript production.
- Native image generation (Codex) + `references/cover_design_spec.md` + `scripts/cover_finalize.py` for cover production.
- `isbn-신청-epub` automation for EPUB ISBN (EPUB2 표준, `apply_isbn.py`/`apply_isbn_batch.py`).
- `책유통` and `ebook-distribution-epub` automation for 5-platform distribution.
- `publish_orchestrator.py` for run state, event logs, and Obsidian status notes.

## Operating Defaults

- Use EPUB-only unless the user explicitly requests PDF.
- Use headless browser automation unless the user asks to watch.
- Once every target book has an assigned ISBN number in metadata, continue ISBN asset sync and distribution even if SEOJI status is still `applied`/`접수`; do not wait for final `issued` status unless the user explicitly asks to wait.
- Use one Codex team member thread per book. The current thread is the leader.
- Continue other books when one book is blocked.
- Production and distribution are hard-separated by a mandatory human quality review (책표지 + 책 원문 내용). Never start ISBN application or any 5-platform step while `human_review_status` is not `approved` — this sits on top of all automated gates.
- The Codex leader thread is the only channel that flips `human_review_status`. Slack notification and Slack replies are auxiliary tools (검수 편의·조기 신호용); a Slack-side approval must be re-confirmed in the Codex thread before it is recorded.
- Batch runs are sequential-first with graduation ramp-up (순차 + 졸업 승급): production concurrency starts at 1 (한 권씩). Every human-review outcome is distilled into `references/quality_lessons.md` and embedded in the next book's prompt, so corrections compound book over book. Concurrency rises only after consecutive clean approvals and resets to 1 on any rejection (rules in Batch Mode).
- Distribution runs as small-batch sweeps: when 3–5 approved books have accumulated, run ISBN application and 5-platform distribution together. Per-book immediate distribution only when the user explicitly asks.
- Never print credentials, cookies, tokens, or secret values.
- Stop before live external submission only when the blocker is ambiguous: duplicate ISBN, unclear legal/authorship issue, copyright concern, unclear platform hold, or missing user-owned source material.

## Main Workflow

1. Create or resume a publishing run with:
   ```bash
   python3 "7_AI시스템/자동화프로젝트/출판자동화시스템/publish_orchestrator.py" start --topic "<topic>"
   ```
   For a batch, use `--topics-file`.
2. Initialize teammode with the run id. Add member threads only up to the current production concurrency level (`references/quality_lessons.md` 상태 블록 — starts at 1, 즉 한 권씩). Each member owns exactly one book and runs the `/book` prompt from `book-launch-queue`; **every prompt must embed the full 활성 규칙 section of `quality_lessons.md`** on top of the standard gate contract, so prior corrections carry into every new book.
3. As each `/book` member finishes, link its vault folder with `sync-book-builds` and advance that book's chain (steps 4–8) immediately. Launch the next queued book only when a concurrency slot frees.
4. Before cover, ISBN, or distribution, run the final content gate (two passes):
   ```bash
   uv run /Users/minje/.agents/skills/new-ebook-publish/scripts/quality_gate.py --book-dir "<vault book folder>"
   ```
   - Exit 2 (`blocked_*`): quantitative failure — go to step 5.
   - Exit 3 (`needs_llm_review`): quantitative checks passed. Spawn the `content-quality-final-reviewer` agent on the book folder; it writes `reviewer_verdict.json`, `content_quality_final_review.md`, and `reader_value_scorecard.md`. Then rerun the same gate command to merge the verdict. A verdict older than the EPUB is treated as stale and re-review is required.
   - Exit 0 (`pass`): continue.
5. If the gate fails, mark the book blocked and send the generated `rewrite_requests.md` (in the book folder — per-chapter instructions with duplicated-sentence excerpts and reviewer rewrite requests) back to the same book member thread verbatim. After the rewrite, rebuild the EPUB and rerun the gate from step 4. Do not continue that book, and cap rewrite cycles at 3 before escalating to the user.
6. Cover production. Quality bar and prompt rules live in `references/cover_design_spec.md` (single source of truth — premium deep-color background, layered rendered objects, gold accents; NOT flat vector shapes only). Flow:
   1. Select a non-repeating visual concept (reserves it in the ledger immediately, so parallel book threads never receive the same concept):
      ```bash
      uv run /Users/minje/.agents/skills/new-ebook-publish/scripts/cover_metaphor_ledger.py suggest --title "<title>" --topic "<topic>"
      ```
   2. Build the generation brief: 서지 텍스트는 `_meta.md`에서 그대로(title/subtitle/author/publisher — 임의 문구 창작 금지), 비주얼은 ledger concept + design spec의 레이아웃·질감 기준.
   3. Generate the image — **GPT Image 2.0 (`image_generation` 도구, feature flag stable)로 렌더링하는 것이 유일한 정식 경로**. **PIL·SVG·matplotlib 등 코드 드로잉 금지** — 플랫 벡터는 design spec의 입체 렌더 기준 미달.
      - **Codex 세션 (앱·CLI 공통)**: `image_generation` 도구를 직접 호출한다 (별도 API 키 불필요).
      - **Claude Code 등 외부 환경**: `codex exec --skip-git-repo-check -C "<책 폴더>" "<프롬프트>"`로 위임 — 검증된 절차를 프롬프트에 그대로 포함할 것: ①image_generation 도구 호출 ②도구가 저장한 실제 절대 경로 출력 ③`cover_candidate.png`로 복사 ④`ls -la` 결과 출력 ⑤성공 시 `FILE_CONFIRMED` / 불가 시 `NO_IMAGE_TOOL`만 출력. (절차를 명시하지 않으면 모델이 코드 드로잉으로 빠지거나 경로를 놓친다.)
      - **호출 측에서 반드시 파일 존재를 재확인하라** (`ls cover_candidate.png`) — 모델이 생성 성공을 환각한 사례가 있음. 모델의 주장보다 파일 존재가 진실이다.
      - 정말 생성이 불가한 환경이면 책 폴더에 `cover_brief.md`(완성 브리프)를 남기고 `cover_quality: baseline`을 기록, 유통 전 재생성 대상으로 표시한다.
   4. Normalize and install (any size/format → 1500×2220 `cover.jpg`, old cover backed up, `cover_meta_match_status`가 `pending`으로 리셋됨):
      ```bash
      uv run /Users/minje/.agents/skills/new-ebook-publish/scripts/cover_finalize.py --book-dir "<vault book folder>" --candidate "<cover_candidate.png>" --generator gpt-image-2
      ```
   5. 한글 자획이 뭉개졌거나 글꼴 굵기가 빈약하면 재생성하거나, 텍스트 영역을 비운 배경만 생성해 Pretendard 타이포그래피를 후처리로 얹는다 (design spec §4b·§7).
   6. After accepting, confirm the concept with `record --book-dir "<vault book folder>"` (replaces the reservation and stamps `cover_metaphor_status`); if the cover work is cancelled, free it with `release --title "<title>"`.
7. **Cover↔metadata verification (mandatory before ISBN — the #1 SEOJI rejection cause).** After any cover is generated or replaced, visually read `cover.jpg` and compare against `_meta.md`:
   - cover title == `title`, cover subtitle == `subtitle`, cover author byline == `author` (exact match; 저자명이 다르면 반려 1순위)
   - the cover tagline must describe THIS book's promise (no copy reused from another title)
   Record `cover_meta_match_status: pass` in `_meta.md` only when all match; on mismatch record `cover_meta_match_status: mismatch` plus a `cover_meta_mismatch` note, then fix the cover (or the metadata if the cover is authoritative) and re-verify. The `isbn` readiness stage hard-fails without `pass`. The EPUB embeds the cover, so replacing `cover.jpg` requires an EPUB rebuild before distribution.
8. **Human quality review (mandatory — the production/distribution boundary).** Runs after the content gate, cover production, and cover↔metadata verification all pass. 검수 대상은 책표지와 책 원문 내용이다.
   1. Set `human_review_status: pending` in `_meta.md`, then send the review packet to Slack via the Hermes gateway (auxiliary notification — never the approval channel):
      - cover image (표지 검수는 슬랙 안에서 끝나도록 메시지에 바로 표시)
      - gate score summary: 한국어 자연도, 독자 가치, 본문 자수, 유사도 지표
      - table of contents + representative excerpts per chapter
      - a PDF preview build attached (Slack previews PDF inline; it cannot render EPUB)
      - the EPUB file attached (for reading in the Books app on iPhone/Mac)
   2. Wait for the user's verdict **in the Codex leader thread** — the only channel that changes `human_review_status`. Treat Slack replies as advisory input and re-confirm them in the Codex thread before recording.
   3. On approval: record `human_review_status: approved` and `human_review_date` (KST) in `_meta.md`, then continue to the next step. Log any accompanying user comments into the 관찰 로그 of `references/quality_lessons.md` and advance the clean-approval streak in its 상태 블록.
   4. On rejection: record `human_review_status: rejected`, translate the user's feedback into per-chapter rewrite instructions or a cover-redo brief, send them to the same book member thread, rebuild the EPUB (and cover if applicable), and re-enter the gate loop from step 4. Human-review rejections are user-driven and do not count against the automated-gate 3-rewrite cap. **Additionally, distill the rejection's root cause into the 관찰 로그 of `quality_lessons.md`** (같은 원인 2회 반복 시 활성 규칙으로 승격) and reset the concurrency level to 1 — subsequent books return to sequential production until the streak rebuilds.
   5. A book without `human_review_status: approved` must never reach ISBN application or distribution, regardless of automated gate results.
9. Before any 5-platform distribution draft, saved application, or live submission, select content-based distribution categories for the book. Do not reuse a blanket default such as `IT/프로그래밍`.
10. Gate every external step with the staged readiness runner (single command, hard-stops at the first red stage):
   ```bash
   uv run /Users/minje/.agents/skills/new-ebook-publish/scripts/epub_publish_readiness.py --book-dir "<vault book folder>" --stage <stage>
   ```
   - Before EPUB is considered final: `--stage artifact` (epubcheck, colophon ISBN/발행일/정가 ↔ `_meta.md` 정합, conversion-notice leakage, OPF metadata). **판권은 pandoc 빌드에 내장하지 말고 빌드 후 `ebook-distribution-epub/add_epub_colophon.py <slug>`로 삽입할 것** — 유통 사전검수가 판권을 파일명(`copyright.xhtml`)으로 탐지하므로 pandoc의 `ch00N.xhtml` 명명으로는 차단된다 (TROUBLESHOOTING 사이클 13).
   - Before running `isbn-신청-epub/apply_isbn.py`: `--stage isbn` (SEOJI 기본 필드 + 풍부 메타 8필드 + `epub_isbn_form_detail: EPUB2` 명시 + PDF/EPUB ISBN 분리).
   - Before any 5-platform draft or submission: `--stage all` (adds category selection, lowercase `cover.jpg`, cover concept ledger, assigned `epub_isbn`).
   A red stage writes `publish_readiness_status: red` + `publish_readiness_report.json`; fix the listed failures and rerun. Never bypass a red stage manually.
11. Generate or refresh the EPUB dashboard:
    ```bash
    uv run /Users/minje/.agents/skills/new-ebook-publish/scripts/render_epub_dashboard.py
    ```
12. Run `preflight-live` (belt-and-suspenders on top of stage gates). If clean, continue with `resume --execute --max-steps N`.

## Chapter Writing — 장별 병렬 집필 (기본)

원고 집필 단계는 한 세션의 순차 role-play가 아니라 **장별 독립 codex 서브 세션의 병렬 실행**이 기본이다. 순차 집필은 서브 세션 실행이 불가능한 환경에서만 폴백으로 허용한다. 근거: 순차 집필은 권당 시간의 최대 병목이며, 같은 세션이 5장을 쓰면 문장틀이 복제되어 blocked_similarity 재작성(연속 3권, 유사도 0.66~0.94)의 구조적 원인이 된다.

절차:

1. 리서치·아웃라인 확정 후, `chapter_uniqueness_map.md`에 장별 역할·구조 패턴·사례 도메인·시작 방식·핵심 문형을 먼저 배정한다 (R05).
2. 장별 브리프를 `agents/briefs/writer_ch{N}_brief.md`로 작성한다 — 필수 포함: 그 장의 아웃라인, 고유성 맵 배정, 약속한 산출물, 새 인사이트·근거·한국 사례·독자 행동·자산/실패 사례 계약, 리서치 참조 경로, `quality_lessons.md` 활성 규칙 전문.
3. 병렬 실행:
   ```bash
   python3 /Users/minje/.agents/skills/new-ebook-publish/scripts/parallel_chapter_writers.py --book-dir "<vault book folder>"
   ```
   각 writer는 자기 브리프만 읽고 다른 장은 열지 않는다. 완료 시 chapter{N}.md + `agents/writer_ch{N}.md` 증거를 남긴다.
4. 실패 장(JSON `failed`)만 `--chapters 2,4` 형태로 재실행한다. 전 장 성공 후 교차 리뷰(cross_reviewer)·팩트체크·게이트는 기존 절차 그대로 진행한다 — 병렬화는 집필 구간만 바꾸며 품질 장치는 손대지 않는다.
5. 진행 보고 파일에는 각 장 완료 시점에 chapter{N} 이벤트를 append한다 (밀린 장은 함께).
6. 사용량 조절: 대시보드 빌드 동시성이 2 이상일 때 서브 세션 폭주가 걱정되면 `WRITER_MAX_PARALLEL=3`으로 제한할 수 있다 (기본 5).

## Research Cache — 주제 클러스터 리서치 재사용

리서치를 시작하기 전에 `3_출판 및 SNS/전자책원고/_research_cache/<클러스터>/`를 먼저 확인한다 (클러스터는 kebab-case 주제군, 예: `ai-automation-business`, `ai-content-marketing`). 캐시에 같은 출처의 전사·클레임 원장·사례 뱅크가 있으면 재검증(링크 생존·수치 시점) 후 재사용하고, 새로 수집한 재사용 가능 산출물(유튜브 전사, 공식 문서 요약, 검증된 클레임)은 종료 시 캐시에 저장한다. 책 고유 주장·구성은 캐시하지 않는다 — 캐시 대상은 원천 자료와 검증된 사실만이다.

## Batch Mode — 10권 배치 (순차 + 졸업 승급)

사용자가 키워드·주제 문구 묶음을 주면 10권 단위 배치로 받되, **한꺼번에 병렬 투입하지 않는다.** 순차 제작 → 매권 검수 학습 → 병렬 승급 순서로 진행한다. 목표: 매권의 검수 피드백이 다음 책 프롬프트에 복리로 반영되어 배치 후반으로 갈수록 재작성 없이 통과하는 안정 상태에 도달하는 것.

1. **주제 구조화**: 키워드를 `state/topic_batches/<run-id>.json` 포맷(기존 스키마: `id`·`proposed_title`·`detail_topic`·`keywords`·`reader_target`·`differentiation_angle` 등)으로 확장해 저장하고 `start --topics-file`로 run 생성. 주제 간 독자·약속이 겹치지 않게 차별화 각도를 먼저 검토.
2. **순차 제작 (동시성 1)**: 승인된 행 순서대로 한 권씩 제작한다. 각 책이 자동 게이트 → 표지 → cover↔meta 검증 → 사람 검수 대기까지 완주한 뒤 다음 책 집필을 시작한다. 프롬프트는 약속·근거·실행성·자산·실패 처리·중복 임계값과 `quality_lessons.md` 활성 규칙 전체를 포함한다.
3. **복리 학습 루프 (매권 필수)**: 검수 결과가 나올 때마다 `references/quality_lessons.md`를 갱신한다.
   - 반려·수정 지시 → 근본 원인으로 증류해 관찰 로그에 기록. 같은 원인이 2회 나오면 활성 규칙으로 승격해 이후 모든 프롬프트에 자동 포함.
   - 승인 시 동반 코멘트("이 부분은 좋았다/아쉬웠다")도 관찰 로그에 남긴다.
   - 임계값·금지 패턴처럼 게이트 계약 자체를 바꿔야 하는 교훈은 `book-launch-queue` 계약에도 반영한다.
   - 표지 방향 교훈(팔레트·레이아웃·타이포 취향)은 `references/cover_design_spec.md`에 반영한다.
4. **졸업 승급 규칙**: 연속 2권이 클린 통과(자동 게이트 재작성 0회 + 표지 재생성 0회 + 사람 검수 1회 승인)하면 동시성 +1, 상한 3 (사용자가 명시적으로 올리면 예외). 사람 검수 반려 또는 자동 게이트 재작성이 발생하면 동시성을 1로 리셋하고 streak을 0부터 다시 쌓는다. 현재 동시성·streak은 `quality_lessons.md` 상단 상태 블록이 단일 진실원 — 승급·리셋 때마다 즉시 갱신한다.
5. **유통 소배치 스윕**: `human_review_status: approved`인 책이 3–5권 모일 때마다 `apply_isbn_batch.py`로 ISBN 일괄 신청 → 번호 배정 대기(issued 대기 불필요) → 판권 실번호 갱신·재빌드 → `책유통` 스킬로 5사 일괄 유통. 미승인 책은 스윕에서 제외하고, 사용자가 특정 책의 즉시 유통을 지시하면 단권 스윕도 허용.
   - **배정 번호의 플랫폼 폼 반영은 코드가 보장하되 반드시 검증하라**: 신규 등록은 dispatch가 `epub_isbn`을 자동 입력하고(없으면 게이트가 실행 차단), **기존 등록 건의 교체·재제출은 폼에 남은 옛 ISBN(PDF fallback)을 자동 교정** — `submit_ridi_epub_fixes.py`가 `e_isbn13`을 `epub_isbn`으로 강제 갱신한다 (사이클 14: 리디 구판이 PDF ISBN으로 남아 있던 사고). 유통 제출 후 각 플랫폼 폼의 ISBN 값 == `epub_isbn`을 재조회로 확인하고 불일치 시 수정 제출.
6. **관측**: 대시보드가 권별 게이트·사람 검수·ISBN·유통 상태와 현재 동시성·클린 streak을 집계. 실패 책은 `rewrite_requests.md`/`publish_readiness_report.json` 기준으로 진단 후 재투입 (재작성 3회 상한 유지). 검수 대기(`pending`)·반려(`rejected`) 책은 별도 큐로 표시.

동시성 안전장치 (동시성이 2 이상으로 승급된 구간에 적용): 표지 ledger는 suggest 시점 예약, reviewer verdict는 본문 해시로 신선도 판정(표지·판권 교체는 재리뷰 불필요), readiness·게이트는 책 폴더 단위로 독립. 병렬 중 한 권이라도 반려되면 진행 중인 책은 마저 완성하되 새 책 투입은 동시성 1 기준으로 되돌린다.

## Quality Lessons Ledger — `references/quality_lessons.md`

복리 학습의 단일 진실원. 코디네이터(리더 스레드)만 갱신하며, run이 바뀌어도 리셋하지 않고 계속 누적한다 (배치를 넘어 쌓이는 것이 복리의 핵심).

구조는 3개 섹션으로 고정:

1. **상태 블록** — `concurrency_level`, `clean_streak`, `last_updated` (KST). 승급·리셋·검수 완료 때마다 즉시 갱신.
2. **활성 규칙** — 모든 새 `/book` 프롬프트에 통째로 포함되는 규칙 목록. 한 줄 형식: `- [R##] <하지 말 것/할 것> — <이유> (출처: <책 slug>, <날짜>)`. 관찰 로그에서 같은 근본 원인이 2회 이상 반복되면 여기로 승격. 규칙이 게이트 계약·design spec으로 코드화되면 원장에는 `(계약 반영됨)` 표시를 남기고 유지한다 — 삭제하지 않는다.
3. **관찰 로그** — 책별 검수 기록. 한 줄 형식: `- YYYY-MM-DD | <책 slug> | approved/rejected | <근본 원인 또는 코멘트 증류> | streak N`. 원문 피드백을 그대로 붙이지 말고 다음 책에 적용 가능한 형태로 증류해 적는다.

운영 규칙:

- 검수 결과 기록 없이 다음 책 집필을 시작하지 않는다 (학습 루프가 끊기면 순차 제작의 의미가 없다).
- 활성 규칙이 15개를 넘으면 유사 규칙을 병합·일반화해 압축한다 (프롬프트 비대화 방지).
- 관찰 로그는 원장 하단에 계속 누적하되, 최근 20권 분량만 활성 규칙 승격 판단에 사용한다.

## Publish Readiness Stages

`epub_publish_readiness.py` chains four hard gates; each failure blocks all later stages:

| Stage | Verifies | Blocks |
|---|---|---|
| 1 content | `content_quality_final_status: pass` on gate v3 + fresh `reviewer_verdict.json` (newer than the EPUB, or matching `body_sha1` — cover/colophon-only rebuilds don't force re-review) | cover, ISBN, distribution |
| 2 artifact | `book_artifact_auditor.py` (epubcheck v5, title page, cover spec) + colophon ISBN/발행일/정가 match `_meta.md` + conversion-notice ≤ 1 + markdown-table pipe leakage 0 + OPF title/`dc:language=ko*` + **유통 플랫폼 사전검수(`assert_epub_platform_rules`: 판권 파일명·교보 300KB 제한 등)를 조기 실행** (legacy-PDF-edition failures are warnings, not blockers) | ISBN, distribution |
| 3 isbn | `human_review_status: approved` + `human_review_date` recorded (사람 검수 게이트), SEOJI required fields, rich-metadata 8 fields, `summary` ≥ 200 chars, `epub_isbn_form_detail: EPUB2` explicit, `cover_meta_match_status: pass` (표지↔메타 서지 일치), valid `publication_date`, PDF/EPUB ISBN distinct | apply_isbn.py |
| 4 distribution | `human_review_status: approved` + `human_review_date` recorded, category selected + 5 platform category fields, lowercase `cover.jpg` exists, `cover_metaphor_status: pass`, `epub_isbn` assigned | 5-platform upload |

Platform-rule invariants (rental 30일/4,000원, B2B Y, AI 표시 ON, 밀리 file type=EPUB, 리디 서비스 시작일 즉시 오픈, 발행일 +1개월) stay owned by `ebook-distribution-epub` uploaders; this gate only verifies their metadata prerequisites.

밀리의서재 중복 공급 금지 (2026-07-15 정책): 동일 도서를 PDF·EPUB 두 형식으로 밀리에 공급하면 일괄 반려된다. 같은 책의 PDF 트랙이 밀리에 review/live면 EPUB은 제출하지 않는다 — `dispatch.py`의 밀리 중복 게이트가 코드로 차단하며(`skipped_duplicate_pdf`), 수동 제출 시에도 같은 규칙을 지킨다. 또한 AI 활용 콘텐츠는 회원 CS 누적 시 반려·서비스 중지될 수 있으므로 "등록(review)"을 판매 확정으로 간주하지 않는다.

On top of that, the human review gate is enforced at both levels: the coordinator refuses `apply_isbn.py`, `apply_isbn_batch.py`, and every distribution dispatch while `human_review_status` is not `approved`, **and the same rule is enforced in code** — stages 3 (isbn) and 4 (distribution) hard-fail red unless `human_review_status: approved` with `human_review_date` recorded, and `publish_orchestrator.py preflight-live` fails any book without that approval. The coordinator check remains as belt-and-suspenders on top of the script gates.

## Final Content Gate

The gate has two enforced layers. Both are mandatory; `quality_gate.py` merges them and is the only writer of the `_meta.md` quality fields.

**Layer 1 — quantitative (script).** `quality_gate.py` extracts the shipped EPUB (no silent markdown fallback: a declared EPUB that is missing or unreadable blocks with `blocked_missing_epub`) and enforces:

- EPUB body length is reported against its book-type recommendation, but length alone never passes or blocks publication.
- The weighted reader-value score is at least 85 and every promised content or asset is present.
- 모든 장·절 제목에는 명시적 고유 앵커를 부여하고, EPUB 빌드 직후 `book/scripts/validate_epub_toc_targets.py <epub>`를 실행한다. nav.xhtml과 toc.ncx의 번호 절 링크가 존재하는 서로 다른 앵커로 이동하지 않으면 EPUB을 완료로 기록하지 않는다.
- The `/book` structural originality audit (`content_quality_audit.py`) passes with its strict shared thresholds: chapter-pair sentence shingle jaccard ≤ 0.08, shared sentences ≤ 8, sequence similarity ≤ 0.18, paragraph duplicate ratio ≤ 0.08, shared paragraphs ≤ 1, boilerplate hits 0. This is the same bar the 2026-06-18 complaint postmortem set — the final gate can never be looser than the mid-pipeline audit.
- Repeated sentence starts ≤ 18%.

**Layer 2 — qualitative (LLM).** The `content-quality-final-reviewer` agent reads every chapter (sampled excerpts, all chapters) and writes:

- `reviewer_verdict.json` — machine-readable: `promise_resolution_score`, `new_information_score`, `source_accuracy_score`, `actionability_score`, `korean_naturalness_score`, `differentiation_score`, weighted `reader_value_score` (pass ≥ 85), `blocking_issues`, `verdict`, `issues`, `rewrite_requests`
- `content_quality_final_review.md`
- `reader_value_scorecard.md`

Without a fresh `reviewer_verdict.json` the gate exits `needs_llm_review` — a book can never pass on keyword heuristics alone. Script heuristics only act as floors that block obviously broken text early.

The script records into `_meta.md`:

- `content_quality_gate_version: 3`
- `content_quality_final_status: pass`, `needs_llm_review`, or `blocked_*` (`blocked_content_contract`, `blocked_similarity`, `blocked_korean_quality`, `blocked_reader_value`, `blocked_missing_epub`)
- `content_quality_failures` — the full failure list, not just the first
- `content_quality_final_score`, `content_body_chars`, `content_repeated_start_ratio`
- report pointers: `content_quality_final_report`, `chapter_similarity_report`, `reader_value_scorecard`, `content_quality_metrics`, and `content_rewrite_requests` when failed

Do not apply for ISBN or distribute a book unless `content_quality_final_status: pass` **and** `human_review_status: approved`. This is additionally enforced in code: `publish_orchestrator.py preflight-live` fails any book whose `content_quality_final_status` is not `pass`, whose `human_review_status` is not `approved`, whose `distribution_category_status` is not `selected` (including missing per-platform category fields), or whose `cover_metaphor_status` is not `pass`.

## Cover Deduplication

Use `references/cover_metaphor_ledger.json` as the shelf-identity ledger. Do not reuse the same main image element, metaphor family, layout, or dominant palette in nearby books.

Reject or redesign covers that repeat recent concepts such as:

- node graph
- cursor block
- document stack
- stairs or ladder
- generic AI brain
- repeated blue-purple network
- repeated beige/ivory minimalist field

Record the accepted concept into `_meta.md`:

- `cover_metaphor`
- `cover_main_element`
- `cover_palette`
- `cover_layout`
- `cover_metaphor_status`

## Distribution Category Selection

Before using `책유통` or `ebook-distribution-epub` to save or submit a book on Kyobo, Ridi, YES24, Aladin, or Millie's Library, choose categories from the book's actual reader promise. The category decision is mandatory per book and must not be copied blindly from a previous title.

Inputs to review quickly:

- title and subtitle
- `_meta.md` topic, description, keywords, and reader target
- table of contents, introduction, conclusion, and at least one representative chapter
- `reader_value_scorecard.md` when available
- EPUB body text if the metadata is too generic

Decision rules:

- Categorize by the reader's buying intent and problem to solve, not by the tool mentioned in the title.
- Use `IT/프로그래밍` or the closest computer/IT category only when the book's main promise is programming, software development, data analysis, AI tool operation, prompt engineering practice, or technical workflow execution.
- Do not select `IT/프로그래밍` merely because the book mentions AI, ChatGPT, automation, prompts, SNS, or online tools.
- If the book teaches business creation, sales, monetization, marketing, branding, commerce, or side income, prefer the closest `경제경영`, `창업`, `마케팅`, `인터넷비즈니스`, or `재테크/부업` category available on that platform.
- If the book teaches work habits, time management, mental management, productivity, personal growth, or career execution, prefer the closest `자기계발`, `시간관리`, `성공/처세`, or `직장인 업무능력` category.
- If the book is for parents, teachers, students, or classroom coaching, prefer the closest `교육`, `자녀교육`, `교사`, or `학습법` category.
- If exact category paths differ by platform, choose the closest visible child category; if no child category fits, choose the broader parent category and record the reason.
- If two categories are plausible, choose the one a non-technical buyer would browse first, then record the second as a fallback.

Fast mapping examples:

| Book type | Preferred category direction |
|---|---|
| 시간·멘탈 운영법, 루틴, 실행관리 | 자기계발 / 시간관리 / 업무능력 |
| 무인 공간 대여, 무자본 지식창업, 부업 수익화 | 경제경영 / 창업 / 부업 |
| SNS 퍼스널 브랜딩, 팬덤, 크리에이터 수익화 | 경제경영 / 마케팅 / 인터넷비즈니스 |
| 크로스보더 커머스, 온라인 판매 | 경제경영 / 창업 / 무역 / 쇼핑몰 |
| 업종별 프롬프트, AI 업무 자동화, AI 리터러시 | 컴퓨터/IT / AI, unless the book is mainly business, education, or self-development |
| 학부모·교사용 ChatGPT 학습 코칭 | 교육 / 자녀교육 / 교사교육 / 학습법 |

Record the decision into `_meta.md` before distribution:

- `distribution_category_status: selected` or `needs_manual_review`
- `distribution_category_primary`
- `distribution_category_fallback`
- `distribution_category_reason`
- `kyobo_category`
- `ridi_category`
- `yes24_category`
- `aladin_category`
- `millie_category`

Stop before live submission and mark `distribution_category_status: needs_manual_review` if the content is too generic to judge, the platform category tree has no close match, or a platform forces a category that would materially misrepresent the book.

## Dashboard

## Correction Loop and Release Gate

After `책제작`, run the local v3 QC before any existing-product replacement:

```text
/Users/minje/Documents/Obsidian Vault/7_AI시스템/자동화프로젝트/출판자동화시스템/ebook_correction_qc.py
```

The gate checks EPUB OPF/nav/NCX/XHTML links, CSS and image assets, rendered pages, table overflow, blank pages, repeated or low-value content, absent image/table references, and cover OCR. OCR uncertainty is `needs_visual_review`, not an automatic pass. The visual reviewer uses `ebook-visual-qc-reviewer` and writes `visual_qc_verdict.json`.

`final_qc_verdict.json` records `qc_version`, EPUB and cover SHA-256 values, verdict, warnings, failures, repair requests, and release approval fields. A changed hash invalidates the previous approval. Automatic approval requires the configured Korean naturalness and reader-value thresholds, zero deterministic issues, and exact cover metadata; otherwise keep `release_approval_status: pending`.

Use `correction_queue_cli.py` for the 18-book queue. It is existing-product-only, requires all platform product IDs, never creates a new registration, and separates `wait_platform_lock`, `wait_auth`, and `manual_escalation`. Aladin missing upload input and Millie `process_status: 161` remain waiting states. Do not treat login pages, 404, or disabled inputs as successful submission.

The dashboard file is:

```text
/Users/minje/Documents/Obsidian Vault/3_출판 및 SNS/new-ebook-publish_EPUB_대시보드.md
```

It must show at a glance:

- cover thumbnail
- title, author, publication date, price
- EPUB file and EPUB ISBN
- ISBN status, distinguishing assigned-number progress from final SEOJI issuance
- distribution category status and per-platform category choices
- 5-platform distribution status
- body character count
- book-type length-band warning and content-density pass/fail
- final content score
- similarity, Korean naturalness, reader value, and cover metaphor status
- human review status per book (`pending` / `approved` / `rejected`)
- current production concurrency level and clean-approval streak (from `references/quality_lessons.md`)
- hold queues for length, similarity, Korean quality, reader value, cover concept duplication, and human review (pending·rejected)

After writing or refreshing the dashboard, run `qmd embed` from the vault root.
