# 6장. Codex 실무 활용사례 (실제 공개 사례 기반)

> 커뮤니티·공식 문서에서 검증된 실전 패턴 5가지

---

## 26절. 대량 변경(PR 폭주) 작업

### "작은 단위 PR을 빠르게 쪼개서 연속 제출" 워크플로

#### 출처: DEV Community — "How I Used Codex to Ship Nearly 80 Pull Requests in Two Days"

#### 핵심 전략: Web + CLI 병행

| 도구 | 역할 | 사용 방식 |
|---|---|---|
| **Codex Web (Cloud)** | 허브/지휘소 | 한 번에 5개 작업을 병렬 위임 |
| **Codex CLI** | 정밀 편집 | 로컬에서 세밀한 수정, 충돌 해결 |

#### 워크플로 단계

```
[1] 전체 작업을 분해 — 충돌 없는 최소 단위로 쪼개기
     ↓
[2] Codex Web에 5개 작업 동시 할당
     ↓
[3] 각 작업이 독립 샌드박스에서 병렬 실행
     ↓
[4] 결과를 브라우저에서 리뷰 + 필요 시 수정 요청
     ↓
[5] PR 생성 (한 클릭으로 Draft PR 포함)
     ↓
[6] 충돌 발생 시 → CLI에서 로컬 rebase 후 해결
     ↓
[7] 다음 5개 작업 할당 → 반복
```

#### "주방장" 비유

> "기존 LLM 코딩 어시스턴트는 혼자서 주문을 받고 → 요리하고 → 서빙하는 1인 요리사. Codex Web은 총주방장이 되는 것 — 5개 주문을 5명의 요리사에게 나누고, 나오는 요리만 검수하면 된다."

#### 핵심 원칙

| 원칙 | 설명 |
|---|---|
| **최소 단위 분해** | 하나의 PR = 하나의 독립적 변경 |
| **범위 경계 사전 정의** | 충돌 방지를 위해 파일/모듈 단위로 분리 |
| **병렬 환경 활용** | 같은 리포를 여러 디렉토리에 clone |
| **5개 동시 제한** | 한 번에 5개 이상 할당하면 충돌 위험 증가 |
| **충돌 즉시 해결** | 로컬 rebase로 빠르게 처리 |

#### 성과 지표

| 지표 | 수치 |
|---|---|
| 2일간 제출한 PR 수 | ~80개 |
| 한 번에 병렬 실행 작업 수 | ~5개 |
| 작업 유형 | 유지보수, 소규모 수정, 스타일 변경 |

#### 적합한 작업 유형

- 대량 코드 마이그레이션 (API 변경, 라이브러리 교체)
- 반복적인 소규모 수정 (린트 규칙 적용, 로깅 추가)
- 문서 일괄 업데이트
- 테스트 코드 대량 추가

#### 주의사항

- 대규모 리팩토링에서는 "반복마다 새 PR을 열려 하는" 경향이 있어 기존 브랜치 이어가기가 불편할 수 있음
- 작업 분해의 정밀도가 곧 품질 — "엔지니어에게 넘기기 전에 분해를 잘 할수록 결과가 좋다"

> **미래 전망:** "앞으로 엔지니어의 경쟁력은 구현이 아니라 '무엇을 만들 것인가'에 집중될 것이다. 기획력과 아키텍처 설계가 핵심이 된다."

---

## 27절. 공식 워크플로 레시피 기반 개발

### 이슈→작업 정의(DoD)→수정→실행/검증→PR — "끝단까지" 가는 패턴

#### 출처: OpenAI Developers — Codex Workflows

#### 표면(Surface)별 선택 가이드

| 표면 | 최적 상황 | 컨텍스트 동작 |
|---|---|---|
| **IDE 확장** | 대화형 편집, 빠른 수정 | 열린 파일이 자동으로 컨텍스트에 포함 |
| **CLI** | 로컬 자동화, 스크립팅, CI/CD | 경로를 명시적으로 언급해야 함 (`/mention`, `@`) |
| **Cloud** | 장시간 병렬 작업, 위임 | 전체 리포가 격리 샌드박스에 프리로드 |

#### 레시피 1: 코드베이스 탐색/온보딩

**상황:** 새 프로젝트에 합류하거나, 인수받은 서비스를 파악할 때

```
이 프로젝트의 전체 구조를 설명해줘:
1. 주요 모듈과 각 모듈의 책임
2. 요청(request) 흐름 — 진입점부터 DB까지
3. 데이터 모델 구조
4. 주의해야 할 "gotcha" 포인트
```

#### 레시피 2: 버그 수정 (이슈 → PR)

**상황:** 보고된 버그를 수정할 때

```
[이슈] #128: 결제 시 금액이 음수인 경우 오류 없이 처리됨

[재현 조건]
POST /api/payments { amount: -100 }
→ 현재: 200 OK (결제 성공)
→ 기대: 400 Bad Request

[지시]
1. 관련 코드를 찾아 원인을 분석해줘
2. 금액 유효성 검사를 추가해줘
3. 수정 후 재현 조건으로 검증해줘
4. 기존 테스트 + 새 테스트 모두 통과 확인
```

**완료 기준(DoD):** 버그 재현 불가 + 테스트 통과 + 린트 클린

#### 레시피 3: 리팩토링 (계획 → PR)

**상황:** 대규모 리팩토링이 필요한 경우

```
Step 1: 리팩토링 계획 수립 ($plan 스킬 사용)
Step 2: 마일스톤별 파일 이동/변경 명세 + 롤백 전략
Step 3: 마일스톤 1 구현
Step 4: Cloud diff 리뷰 → 필요 시 수정
Step 5: PR 생성 → 승인 후 merge
Step 6: 다음 마일스톤으로 반복
```

#### 레시피 4: 코드 리뷰 (PR 전)

```bash
# CLI에서 /review 명령 사용
codex
> /review   # → 리뷰 프리셋 선택
```

리뷰 프리셋 옵션:
1. **base branch 대비 리뷰** — PR 전 최종 점검
2. **미커밋 변경 리뷰** — staged/unstaged/untracked 모두 검사
3. **특정 커밋 리뷰** — SHA 지정
4. **커스텀 리뷰** — "접근성 문제에 집중해줘" 등

#### 레시피 5: 테스트 작성

```
@src/utils/payment-calculator.ts의 calculateTotal 함수에 대한
테스트를 작성해줘.

- 정상 경로 + 엣지 케이스를 포함
- 빈 입력, 최대 길이, 음수 값 등 경계 조건
- 기존 테스트 파일(tests/ 디렉토리)의 패턴을 따를 것
```

#### Linear 이슈 트래커 통합

Codex는 Linear과 통합되어 이슈에 `@Codex`를 멘션하면 자동으로 Cloud 태스크가 생성되고 결과가 리포트된다. 트리아지 규칙으로 새 이슈를 자동 위임할 수도 있다.

---

## 28절. 장시간(롱 호라이즌) 과업 운영

### "계획→진행→검증→수정" 루프로 안정화

#### 출처: OpenAI Developers — Long Horizon Tasks Cookbook, PLANS.md Guide

#### PLANS.md (ExecPlan) 프레임워크

장시간 작업의 안정성은 **구조화된 계획 문서**에 달려 있다. OpenAI가 공식 제공하는 PLANS.md 프레임워크의 4개 필수 섹션:

```markdown
# PLANS.md

## 1. Progress (진행 상황)
- [x] 프로젝트 구조 설정
- [x] 인증 모듈 구현
- [ ] API 페이지네이션 추가  ← 현재 진행 중
- [ ] 통합 테스트 작성
- [ ] 성능 최적화

## 2. Surprises & Discoveries (예상 밖 발견)
- 테스트 실행 시 OAuth 모듈의 메모리 누수 발견 (증거: 테스트 로그 첨부)
- 기존 DB 스키마에 인덱스가 누락되어 있어 별도 마이그레이션 필요

## 3. Decision Log (의사결정 기록)
- 2024-01-15: REST → GraphQL 전환 대신 REST 유지로 결정
  이유: 기존 클라이언트 호환성 + 팀 학습곡선 고려
- 2024-01-16: 세션 저장소를 Redis에서 JWT로 변경
  이유: 인프라 비용 절감 + 수평 확장 용이

## 4. Outcomes & Retrospective (결과 및 회고)
(주요 작업 완료 또는 전체 계획 완료 시 작성)
```

> **이 4개 섹션은 선택이 아니라 필수다.** 방향 전환 시 반드시 Decision Log에 기록하고, Progress에 반영한다.

#### 장시간 작업의 안정성 비결

| 원리 | 설명 |
|---|---|
| **컨텍스트 압축** | 세션이 토큰 한계에 가까워지면 자동으로 요약 압축 |
| **마일스톤 검증** | 각 마일스톤 완료 시 테스트/린트/타입체크 자동 실행 |
| **계획 우선** | 구현 전 계획을 작성하고 검증 후 실행 |
| **인터랙티브 스티어링** | GPT-5.3-Codex에서 중간 보고를 받으며 방향 조정 |

#### 모델별 장시간 작업 능력

| 모델 | 출시 | 장시간 작업 능력 |
|---|---|---|
| codex-1 (o3) | 2025.05 | 초기 에이전트, 1~30분 작업 |
| GPT-5-Codex | 2025.09 | 에이전틱 코딩 최적화 첫 버전 |
| GPT-5.2-Codex | 2025.12 | 장시간 지시 추종 능력 대폭 향상 |
| GPT-5.1-Codex-Max | 2025.11 | 멀티 컨텍스트 윈도우 압축, 24시간+ 작업 |
| GPT-5.3-Codex | 2026.02 | 인터랙티브 스티어링, 전체 소프트웨어 라이프사이클 |

#### 실험 사례: 25시간 무중단 코드 생성

GPT-5.3-Codex를 "Extra High" 추론 수준으로 설정하여:

| 항목 | 수치 |
|---|---|
| 연속 작업 시간 | ~25시간 |
| 사용 토큰 | ~13M |
| 생성 코드 | ~30,000줄 |
| 작업 내용 | 빈 리포에서 디자인 도구를 처음부터 구축 |

#### PLANS.md 단일 프롬프트 사례

PLANS.md 템플릿을 사용하여 **단일 프롬프트로 7시간 이상** 연속 작업을 수행한 사례가 OpenAI Cookbook에 보고되었다.

#### 장시간 작업 운영 팁

1. **세션당 하나의 프로젝트/과업** — 컨텍스트 전환 시 `/new` 사용
2. **세션 종료 전 요약 요청** — "지금까지 완료한 것과 남은 것을 요약해줘"
3. **AGENTS.md에 영구 지시 기록** — 반복 설명 불필요
4. **추론 수준 조절** — 복잡한 작업은 `high` 또는 `xhigh`
5. **상태 업데이트 빈도** — 1-3단계마다 1-2문장, 마일스톤에서는 상세히
6. **마일스톤마다 git commit** — 체크포인트 확보

---

## 29절. GitHub 안에서 Codex 에이전트 활용

### PR 초안·리뷰 코멘트·변경 제안을 협업형 에이전트로

#### 출처: The Verge, OpenAI Developers — Codex GitHub Integration

#### GitHub 통합 방식

| 방식 | 트리거 | 설명 |
|---|---|---|
| **자동 리뷰** | PR이 draft→ready 전환 시 | 설정에서 "Automatic reviews" 활성화 |
| **온디맨드 리뷰** | `@codex review` 코멘트 | 특정 관점 추가 가능 (예: `@codex review for security`) |
| **PR 협업** | `@codex` 멘션 | 질문, 후속 요청, 변경 요청 |
| **이슈 할당** | 이슈에서 `@codex` | Cloud 태스크 생성 → 변경안 제안 |

#### 리뷰 품질

| 지표 | 수치/설명 |
|---|---|
| **탐지율** | LiveCodeBench 기준 88% (버그, 보안 결함, 스타일 이슈) |
| **리뷰 범위** | PR 전체 + 의존성 + 테스트를 함께 분석 |
| **리뷰 방식** | 코드 실행 및 테스트로 동작 검증 |
| **리뷰 깊이** | 문법 이상 — 로직 개선, 의미 있는 변경 추천 |

#### OpenAI 내부 활용 성과

| 지표 | 수치 |
|---|---|
| PR 리뷰 커버리지 | "대다수"의 PR을 Codex가 리뷰 |
| 일일 이슈 탐지 | 수백 건 (사람 리뷰 전에 발견) |
| 수동 리뷰 시간 절감 | 60% |
| GitHub 연결 끊김 | 90% 감소 |
| PR 생성 지연 | 35% 감소 |
| 도구 호출 지연 | 50% 감소 |
| 작업 완료 지연 | 20% 감소 |

#### VS Code 통합

```
1. OpenAI Codex 확장 설치 (VS Code Marketplace)
2. 코드 선택 → Ctrl+Shift+P → "Codex: Review Code"
3. 인라인 코멘트/제안 확인
4. IDE에서 Cloud 태스크로 작업 위임 → 결과를 로컬에 적용
```

#### Codex GitHub Action

```yaml
# .github/workflows/codex-review.yml
name: Codex Auto Review
on:
  pull_request:
    types: [opened, ready_for_review]

jobs:
  codex-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: openai/codex-action@v1
        with:
          prompt: "이 PR을 리뷰하고 버그, 보안 문제, 성능 이슈를 확인해줘"
          sandbox: "read-only"
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

#### Slack 통합

Codex는 `@Codex` in Slack을 통해서도 접근 가능하여, 개발 채널에서 바로 태스크를 트리거하고 결과를 받을 수 있다.

#### 모바일 지원

ChatGPT iOS 앱에서 Codex Cloud 태스크를 시작하고, 결과를 리뷰하고, 환경을 관리할 수 있다.

#### 협업형 에이전트 비전

> "시간이 지나면 Codex 에이전트와의 상호작용은 동료와의 비동기 협업과 점점 더 닮아갈 것이다. OpenAI는 터미널, IDE, 웹, GitHub, 모바일에 걸쳐 실시간 협업과 비동기 위임을 모두 지원하는 Codex 도구 스위트를 구축하고 있다."

---

## 30절. CLI 고급 기능으로 실무 자동화

### Cloud 태스크 생성/조회, codex apply, 반복 작업 표준화

#### 출처: OpenAI Developers — Codex CLI Reference

#### 전체 CLI 명령어 레퍼런스

| 명령어 | 별칭 | 용도 |
|---|---|---|
| `codex` | — | 대화형 TUI (풀스크린 터미널 UI) |
| `codex exec` | `codex e` | 비대화형 실행 (CI/CD, 스크립트) |
| `codex cloud` | `codex cloud-tasks` | Cloud 태스크 탐색/관리 |
| `codex cloud exec` | — | Cloud 태스크 직접 제출 |
| `codex cloud list` | — | Cloud 태스크 목록 조회 |
| `codex apply` | `codex a` | Cloud 태스크의 diff를 로컬에 적용 |
| `codex resume` | — | 이전 세션 이어하기 |
| `codex fork` | — | 세션 분기(포크) |
| `codex login` | — | 인증 (ChatGPT/API 키) |
| `codex sandbox` | — | 샌드박스 내 명령 실행 |
| `codex execpolicy` | — | 실행 정책 파일 평가 |
| `codex mcp` | — | MCP 서버 관리 / Codex를 MCP 서버로 실행 |
| `codex features` | — | 기능 플래그 관리 |
| `codex completion` | — | 셸 자동완성 스크립트 생성 |

#### `codex apply` — Cloud에서 로컬로 diff 적용

Cloud 태스크의 결과를 로컬 리포지토리에 바로 적용하는 명령:

```bash
# Cloud 태스크의 diff를 로컬에 적용
codex apply <task-id>

# 또는 별칭 사용
codex a <task-id>
```

| 항목 | 설명 |
|---|---|
| **인증** | 로그인 필요 + 태스크 접근 권한 |
| **출력** | 패치된 파일 목록 표시 |
| **실패 시** | `git apply` 실패 시 (충돌 등) exit code ≠ 0 |
| **워크플로** | Cloud에서 작업 → 로컬에서 리뷰 → 커밋 |

#### `codex cloud` — 터미널에서 Cloud 태스크 관리

```bash
# 인터랙티브 피커 (브라우징)
codex cloud

# 직접 태스크 제출
codex cloud exec --env ENV_ID "오픈 버그를 요약해줘"

# best-of-N 실행 (최대 4회)
codex cloud exec --env ENV_ID --attempts 3 "보안 취약점 분석"

# JSON 형태로 태스크 목록 조회
codex cloud list --json
```

JSON 출력 필드: `id`, `url`, `title`, `status`, `updated_at`, `environment_id`, `summary`, `is_review`, `attempt_total`

#### `codex exec` — 반복 작업 스크립트화

```bash
# 기본 실행
codex exec "CHANGELOG.md를 업데이트해줘"

# JSON Lines 출력
codex exec --json "리포 구조를 요약해줘" | jq

# 구조화된 출력 (스키마 지정)
codex exec --output-schema schema.json "릴리스 메타데이터를 생성해줘"

# 결과를 파일로
codex exec -o output.md "코드 품질 리포트를 작성해줘"

# 세션 이어서 실행
codex exec resume --last "이전에 발견한 이슈를 수정해줘"

# 파이프 입력
echo "tests/ 폴더의 커버리지를 분석해줘" | codex exec -
```

#### 승인 모드 제어

| 모드 | 동작 | 플래그 |
|---|---|---|
| **Auto** (기본) | 작업 디렉토리 내 읽기/수정/실행, 범위 밖은 승인 | — |
| **Read-only** | 파일 탐색만, 수정은 승인 필요 | `--sandbox read-only` |
| **Full Access** | 네트워크 포함 모든 접근 | `--sandbox danger-full-access` |
| **Full Auto** | workspace-write + 요청 시 승인 | `--full-auto` |
| **YOLO** | 모든 승인/샌드박스 우회 | `--yolo` |

> `--yolo`는 **격리된 CI/CD 러너에서만** 사용한다. 실제 프로덕션 환경에서는 절대 사용하지 않는다.

#### 슬래시 명령어

| 명령어 | 기능 |
|---|---|
| `/review` | 리뷰 프리셋 열기 (브랜치 diff, 미커밋 변경, 커밋 지정, 커스텀) |
| `/model` | 모델 전환 또는 추론 수준 조정 |
| `/fork` | 대화를 새 스레드로 분기 |
| `/init` | AGENTS.md 스캐폴드 자동 생성 |
| `/status` | 활성 모델, 승인 정책, 토큰 사용량 등 표시 |
| `/diff` | 파일 변경 사항 상세 검사 |
| `/copy` | 최신 어시스턴트 응답 복사 |
| `/compact` | 컨텍스트 압축 (긴 세션에서 사용) |
| `/clear` | 화면 지우기 (스레드 컨텍스트는 유지) |
| `/new` | 새 세션 시작 |
| `/resume` | 이전 세션 이어하기 피커 |

#### 대량 작업 자동화 기능

| 기능 | 설명 |
|---|---|
| `spawn_agents_on_csv` | CSV 파일 기반으로 작업을 팬아웃, 진행률/ETA 추적 |
| Codex GitHub Action | CI/CD에서 Codex 실행 (`openai/codex-action@v1`) |
| CI 자동 수정 | CI 실패 시 자동으로 수정안 생성 + PR |
| MCP 서버 모드 | Codex를 다른 에이전트의 도구로 제공 |

#### 설정 파일 (`~/.codex/config.toml`)

```toml
# 모델 설정
model = "gpt-5.3-codex"

# 승인 정책
approval_mode = "on-failure"

# 샌드박스 설정
sandbox = "workspace-write"

# 웹 검색
web_search = "cached"   # "cached" | "live" | "off"

# 알림 설정
[notifications]
enabled = true
sound = true

# 에이전트 설정 (멀티 에이전트)
[agents]
# 역할별 에이전트 구성
```

#### 실무 자동화 예시: 일일 워크플로

```bash
#!/bin/bash
# daily-codex-workflow.sh

# 1. 최신 코드 가져오기
git pull origin main

# 2. 코드 품질 리포트 생성
codex exec -o reports/quality-$(date +%Y%m%d).md \
  "린트, 테스트, 커버리지를 실행하고 결과를 리포트로 정리해줘"

# 3. Cloud 태스크 상태 확인
codex cloud list --json | jq '.tasks[] | select(.status == "completed")'

# 4. 완료된 Cloud 태스크의 diff 적용
for task_id in $(codex cloud list --json | jq -r '.tasks[] | select(.status == "completed") | .id'); do
  codex apply "$task_id"
done

# 5. 변경 사항 커밋
git add -A
git commit -m "chore: apply completed codex cloud tasks"
git push
```

---

### 참고 출처

- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
- [Codex CLI Slash Commands](https://developers.openai.com/codex/cli/slash-commands/)
- [Codex GitHub Action](https://developers.openai.com/codex/github-action/)
- [Codex Workflows](https://developers.openai.com/codex/workflows/)
- [Codex GitHub Integration](https://developers.openai.com/codex/integrations/github)
- [Non-interactive Mode](https://developers.openai.com/codex/noninteractive/)
- [Long Horizon Tasks Cookbook](https://developers.openai.com/cookbook/examples/codex/long_horizon_tasks/)
- [PLANS.md Guide](https://developers.openai.com/cookbook/articles/codex_exec_plans/)
- [How I Used Codex to Ship ~80 PRs — DEV Community](https://dev.to/tom-takeru/how-i-used-codex-to-ship-nearly-80-pull-requests-in-two-days-34me)
- [Codex in GitHub — The Verge](https://www.theverge.com/)
- [Introducing Upgrades to Codex](https://openai.com/index/introducing-upgrades-to-codex/)
- [Introducing GPT-5.3-Codex](https://openai.com/index/introducing-gpt-5-3-codex/)
- [Config Reference](https://developers.openai.com/codex/config-reference/)
