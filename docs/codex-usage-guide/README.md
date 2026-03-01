# Codex 활용 가이드

> OpenAI Codex CLI를 실무에서 효과적으로 사용하기 위한 종합 가이드 (6장 30절)

## 목차

### 1장. 도입 판단: Codex를 어디에/어떻게 쓰면 이득인가 (Claude Code 비교 포함)

| 절 | 제목 | 파일 |
|---|---|---|
| 1절 | Codex가 "실무를 끝내는 방식": 읽기→수정→실행→검수→PR 흐름으로 이해하기 | [ch01-introduction.md](ch01-introduction.md#1절-codex가-실무를-끝내는-방식) |
| 2절 | Codex가 잘하는 일/약한 일 | [ch01-introduction.md](ch01-introduction.md#2절-codex가-잘하는-일약한-일) |
| 3절 | Claude Code 개요(동일 과업 관점) | [ch01-introduction.md](ch01-introduction.md#3절-claude-code-개요동일-과업-관점) |
| 4절 | Codex vs Claude Code 비교(커뮤니티 관찰 포함) | [ch01-introduction.md](ch01-introduction.md#4절-codex-vs-claude-code-비교) |
| 5절 | 도입 체크리스트 | [ch01-introduction.md](ch01-introduction.md#5절-도입-체크리스트) |

### 2장. 설치·사양·첫 실행

| 절 | 제목 | 파일 |
|---|---|---|
| 6절 | 설치 사양을 쉬운 말로 | [ch02-setup.md](ch02-setup.md#6절-설치-사양을-쉬운-말로) |
| 7절 | 설치: macOS·Linux·Windows(WSL)별 플로우 | [ch02-setup.md](ch02-setup.md#7절-설치-macos·linux·windowswsl별-플로우) |
| 8절 | 인증: ChatGPT 로그인 vs API Key | [ch02-setup.md](ch02-setup.md#8절-인증-chatgpt-로그인-vs-api-key) |
| 9절 | 작업 폴더/리포지토리 세팅 | [ch02-setup.md](ch02-setup.md#9절-작업-폴더리포지토리-세팅) |
| 10절 | 첫 성공 경험(15분 실습) | [ch02-setup.md](ch02-setup.md#10절-첫-성공-경험15분-실습) |

### 3장. Codex 핵심 활용법(실무 템플릿)

| 절 | 제목 | 파일 |
|---|---|---|
| 11절 | 실무형 지시문 템플릿 | [ch03-core-usage.md](ch03-core-usage.md#11절-실무형-지시문-템플릿) |
| 12절 | 파일 편집 기술 | [ch03-core-usage.md](ch03-core-usage.md#12절-파일-편집-기술) |
| 13절 | 실행/검증 루틴 | [ch03-core-usage.md](ch03-core-usage.md#13절-실행검증-루틴) |
| 14절 | "재시도/이어하기"로 긴 작업 관리 | [ch03-core-usage.md](ch03-core-usage.md#14절-재시도이어하기로-긴-작업-관리) |
| 15절 | 반복업무 자동화 | [ch03-core-usage.md](ch03-core-usage.md#15절-반복업무-자동화) |

### 4장. Git·GitHub로 결과물 관리

| 절 | 제목 | 파일 |
|---|---|---|
| 16절 | Git/GitHub 핵심 10개(비개발자용) | [ch04-git-github.md](ch04-git-github.md#16절-gitgithub-핵심-10개비개발자용) |
| 17절 | 표준 SOP | [ch04-git-github.md](ch04-git-github.md#17절-표준-sop) |
| 18절 | Codex로 "PR 단위 작업" 만들기 | [ch04-git-github.md](ch04-git-github.md#18절-codex로-pr-단위-작업-만들기) |
| 19절 | 리뷰 대응 자동화 | [ch04-git-github.md](ch04-git-github.md#19절-리뷰-대응-자동화) |
| 20절 | 되돌리기/충돌 해결 | [ch04-git-github.md](ch04-git-github.md#20절-되돌리기충돌-해결) |

### 5장. PRD를 Codex로 만드는 법(사례 중심)

| 절 | 제목 | 파일 |
|---|---|---|
| 21절 | PRD 킥오프(목차·골격 자동 생성) | [ch05-prd.md](ch05-prd.md#21절-prd-킥오프) |
| 22절 | 문제정의·가설·사용자 시나리오 | [ch05-prd.md](ch05-prd.md#22절-문제정의·가설·사용자-시나리오) |
| 23절 | 요구사항/수용기준(AC)·예외케이스 | [ch05-prd.md](ch05-prd.md#23절-요구사항수용기준ac·예외케이스) |
| 24절 | 설계/데이터/정책까지 PRD에 포함시키기 | [ch05-prd.md](ch05-prd.md#24절-설계데이터정책까지-prd에-포함시키기) |
| 25절 | 측정·출시·운영 + PRD 최종 검수/버전관리 | [ch05-prd.md](ch05-prd.md#25절-측정·출시·운영--prd-최종-검수버전관리) |

### 6장. Codex 실무 활용사례(실제 공개 사례 기반)

| 절 | 제목 | 파일 |
|---|---|---|
| 26절 | 대량 변경(PR 폭주) 작업 | [ch06-real-cases.md](ch06-real-cases.md#26절-대량-변경pr-폭주-작업) |
| 27절 | 공식 워크플로 레시피 기반 개발 | [ch06-real-cases.md](ch06-real-cases.md#27절-공식-워크플로-레시피-기반-개발) |
| 28절 | 장시간(롱 호라이즌) 과업 운영 | [ch06-real-cases.md](ch06-real-cases.md#28절-장시간롱-호라이즌-과업-운영) |
| 29절 | GitHub 안에서 Codex 에이전트 활용 | [ch06-real-cases.md](ch06-real-cases.md#29절-github-안에서-codex-에이전트-활용) |
| 30절 | CLI 고급 기능으로 실무 자동화 | [ch06-real-cases.md](ch06-real-cases.md#30절-cli-고급-기능으로-실무-자동화) |

---

## 참고 자료

- [OpenAI Codex 공식 문서](https://developers.openai.com/codex/)
- [Codex CLI GitHub 리포지토리](https://github.com/openai/codex)
- [Codex CLI 기능 레퍼런스](https://developers.openai.com/codex/cli/reference/)
- [Codex Workflow Recipes](https://developers.openai.com/codex/workflows/)
- [Codex Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide/)
- [Long Horizon Tasks Cookbook](https://developers.openai.com/cookbook/examples/codex/long_horizon_tasks/)

---

*본 가이드는 2025~2026년 공개 자료를 기반으로 작성되었습니다.*
