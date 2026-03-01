# 3장. Codex 핵심 활용법 (실무 템플릿)

> 지시문·파일편집·실행·재시도·자동화 — 실무에서 바로 쓸 수 있는 기법

---

## 11절. 실무형 지시문 템플릿

### 목표/산출물/제약/검증(AC) 4요소 구조

Codex는 명확한 지시를 받을수록 정확하게 작업한다. 실무에서 검증된 **4요소 구조**를 활용한다.

### 4요소 지시문 프레임워크

```
[목표]     무엇을 달성하려는가?
[산출물]   어떤 파일/결과물이 나와야 하는가?
[제약]     하지 말아야 할 것, 지켜야 할 규칙은?
[검증(AC)] 어떻게 성공을 확인하는가?
```

### 예시 1: 코드 수정

```
[목표] 로그인 API에 rate limiting 기능을 추가한다.

[산출물]
- src/middleware/rate-limiter.ts (신규 생성)
- src/routes/auth.ts (미들웨어 적용)
- tests/rate-limiter.test.ts (테스트 코드)

[제약]
- 기존 인증 로직은 변경하지 않는다
- express-rate-limit 라이브러리를 사용한다
- IP당 15분 100회 제한

[검증(AC)]
- npm test 통과
- 101번째 요청에서 429 응답 확인
- 기존 로그인 테스트 모두 통과
```

### 예시 2: 문서 작성

```
[목표] 신규 결제 기능의 PRD 초안을 작성한다.

[산출물]
- docs/prd/payment-v2.md (마크다운 문서)

[제약]
- docs/templates/prd-template.md 형식을 따른다
- 개인정보 관련 법규(GDPR, 개인정보보호법) 고려
- 기존 결제 시스템과의 호환성 언급

[검증(AC)]
- 목표/범위/Non-goals/사용자 시나리오/수용기준 섹션 포함
- 마크다운 문법 오류 없음
- 용어가 기존 문서와 일관성 유지
```

### 예시 3: 반복 작업 자동화

```
[목표] 모든 API 엔드포인트에 요청/응답 로깅을 추가한다.

[산출물]
- src/middleware/request-logger.ts (신규)
- src/routes/*.ts (각 라우터에 미들웨어 적용)
- 변경 요약 리포트

[제약]
- 비밀번호, 토큰 등 민감 필드는 마스킹
- 기존 미들웨어 순서를 변경하지 않음
- 로그 포맷은 JSON

[검증(AC)]
- 각 엔드포인트 호출 시 로그 출력 확인
- 민감 필드가 마스킹되었는지 확인
- 기존 테스트 모두 통과
```

### 예시 4: 비개발자용 (PM/기획자)

```
[목표] CS 접수 현황을 정리한 주간 리포트를 만든다.

[산출물]
- reports/weekly-cs-report.md

[제약]
- 카테고리별 접수 건수, 처리율, 주요 이슈 Top 3
- 표(table) 형식 사용
- 지난 주 대비 변화율 표시

[검증(AC)]
- 모든 카테고리가 누락 없이 포함
- 수치 합계가 전체 건수와 일치
- 마크다운 표 렌더링 정상
```

### 지시문 작성 팁

| 팁 | 설명 |
|---|---|
| **구체적으로** | "API 좋게 만들어줘" ❌ → "GET /users에 pagination 추가" ✅ |
| **파일 경로 명시** | 대상 파일을 정확히 지정하면 정확도 향상 |
| **부정형보다 긍정형** | "~하지 마" 보다 "~해" 가 더 잘 따름 |
| **한 번에 하나씩** | 여러 작업을 나누어 지시하면 품질 향상 |
| **예시 제공** | 원하는 결과물의 샘플을 첨부하면 매우 효과적 |

### `/mention`과 `@` 경로 자동완성

CLI에서는 파일을 직접 언급해야 Codex가 컨텍스트로 인식한다:

```
@src/routes/auth.ts 이 파일의 로그인 핸들러에 rate limiting을 추가해줘
```

---

## 12절. 파일 편집 기술

### 변경 범위 최소화, diff 요약 받기, 파일 단위 작업 쪼개기

### 원칙 1: 변경 범위 최소화

Codex에게 대규모 변경을 한 번에 요청하면 오류 가능성이 높아진다. **작은 단위**로 나누어 지시한다.

```
❌ 나쁜 예: "전체 코드를 리팩토링해줘"
✅ 좋은 예: "src/utils/date.ts의 formatDate 함수를 dayjs 라이브러리로 교체해줘"
```

### 원칙 2: diff 요약 받기

변경 후 반드시 **diff 요약**을 요청한다:

```
변경한 내용을 diff 형태로 보여주고,
각 변경 사항이 왜 필요한지 한 줄씩 설명해줘.
```

Codex는 변경 전/후를 diff로 보여주므로, 리뷰가 쉬워진다.

### 원칙 3: 파일 단위 작업 쪼개기

여러 파일을 수정해야 할 때는 **파일별로 분리**하여 지시한다:

```
Step 1: src/models/user.ts에 email 필드 유효성 검사를 추가해줘.
Step 2: src/routes/user.ts에 해당 검증을 API 레이어에서 호출해줘.
Step 3: tests/user.test.ts에 유효하지 않은 이메일 테스트 케이스를 추가해줘.
```

### 실전 기법: 대량 파일 변경

수십 개 파일을 일괄 변경해야 할 때:

```
모든 .ts 파일에서 console.log를 logger.info로 교체해줘.
단, tests/ 디렉토리의 파일은 제외.
변경된 파일 목록과 각 파일의 변경 라인 수를 알려줘.
```

### 파일 편집 시 주의사항

| 주의사항 | 설명 |
|---|---|
| **백업 먼저** | 중요한 파일은 git commit 후 변경 |
| **점진적 변경** | 한 번에 10개 이상 파일 변경은 단계별로 |
| **리뷰 습관** | Codex의 diff를 반드시 확인 후 승인 |
| **스타일 일관성** | AGENTS.md에 코딩 스타일을 명시 |

---

## 13절. 실행/검증 루틴

### exec로 실행→결과 로그 해석→수정→재실행 (반복)

### 실행/검증 루프의 구조

```
[코드 수정] → [실행] → [결과 확인]
                          ├─ 성공 → 다음 단계
                          └─ 실패 → [오류 분석] → [수정] → [재실행]
```

### 기본 실행 방법

Codex 대화형 모드에서:

```
방금 수정한 코드를 테스트해줘.
npm test 결과를 보여주고, 실패한 테스트가 있으면 수정해줘.
```

### `codex exec`으로 비대화형 실행

```bash
# 단순 실행
codex exec "src/utils/date.ts를 수정한 후 npm test를 실행해줘"

# JSON 출력 (스크립트 연동용)
codex exec --json "린트 검사를 실행하고 결과를 알려줘" | jq

# 결과를 파일로 저장
codex exec -o result.md "테스트 실행 결과를 요약해줘"
```

### 실행 결과 로그 해석 요청

```
위 테스트 실행 결과를 분석해줘:
1. 통과한 테스트 수 / 전체 테스트 수
2. 실패한 테스트의 원인 (각각)
3. 수정 방안 제안
```

### 자동 수정-재실행 루프

Codex에게 "통과할 때까지 수정"을 요청할 수 있다:

```
npm test가 전부 통과할 때까지 다음을 반복해줘:
1. 실패한 테스트 분석
2. 관련 소스 코드 수정
3. 다시 npm test 실행
각 반복마다 무엇을 수정했는지 알려줘.
```

### 검증 체크리스트 패턴

```
다음 검증을 순서대로 실행해줘:
1. npm run lint (코드 스타일 검사)
2. npm run typecheck (타입 검사)
3. npm test (유닛 테스트)
4. npm run build (빌드 성공 여부)
각 단계의 결과를 표로 정리해줘.
```

### 실행 권한(승인 모드)

| 모드 | 설명 | 사용 시나리오 |
|---|---|---|
| `suggest` | 모든 실행 전 승인 필요 | 학습/초기 사용 |
| `auto-edit` | 파일 수정은 자동, 명령 실행은 승인 | 일반 개발 |
| `full-auto` | workspace-write + 요청 시만 승인 | 숙련 사용자 |

---

## 14절. "재시도/이어하기"로 긴 작업 관리

### resume/히스토리 기반 진행

### 세션 재개 (Resume)

Codex는 이전 대화의 전체 맥락을 보존하며 작업을 이어갈 수 있다.

```bash
# 마지막 세션 이어하기
codex resume --last

# 특정 세션 이어하기 (세션 ID 지정)
codex resume <session-id>

# exec 모드에서 이어하기
codex exec resume --last "이전에 찾은 경쟁 조건을 수정해줘"
```

### 세션 포크 (Fork)

한 세션에서 두 가지 접근법을 시도하고 싶을 때:

```
/fork
```

원래 세션을 보존한 채 새로운 분기를 만든다. A/B 테스트처럼 두 가지 구현을 비교할 수 있다.

### 컨텍스트 압축 (Compaction)

긴 세션에서 컨텍스트 윈도우 한계에 도달하면, Codex가 **자동으로 대화 내용을 요약**하여 압축한다.

- 세션이 토큰 한계에 가까워지면 자동 발동
- 이전 대화의 핵심 정보를 유지하면서 토큰을 절약
- 수시간 연속 작업도 가능

### PLANS.md를 활용한 장기 작업

복잡한 장기 작업에는 **PLANS.md** 파일을 활용한다:

```markdown
# PLANS.md

## ExecPlan: 결제 시스템 마이그레이션

### Progress
- [x] 기존 결제 모듈 분석 완료
- [x] 새 API 스키마 설계
- [ ] 데이터 마이그레이션 스크립트 작성
- [ ] 통합 테스트 작성
- [ ] 스테이징 환경 검증

### Surprises & Discoveries
- 레거시 코드에서 사용하지 않는 결제 수단 3개 발견
- 환율 변환 로직이 두 곳에 중복됨

### Decision Log
- 2024-01-15: PostgreSQL → MongoDB 마이그레이션 대신 스키마 확장으로 결정 (이유: 위험 최소화)

### Outcomes & Retrospective
(작업 완료 후 기록)
```

PLANS.md를 사용하면 Codex가 7시간 이상 단일 프롬프트로 작업할 수 있는 사례가 보고되었다.

### Steer Mode로 방향 전환

작업 중간에 방향을 바꾸고 싶을 때, **Steer Mode** (2026년 1월 도입)를 사용한다:

- Codex가 생성 중일 때 인터럽트하여 새 지시를 삽입
- 전체 세션을 리셋하지 않고 방향만 수정
- 진행 상황을 유지하면서 코스 보정 가능

### 긴 작업 관리 팁

| 팁 | 설명 |
|---|---|
| **단계별 체크포인트** | 주요 단계마다 git commit |
| **진행 상황 보고** | "현재까지 진행 상황을 요약해줘" 정기적으로 요청 |
| **PLANS.md 활용** | 장기 작업은 반드시 계획 문서 작성 |
| **reasoning 레벨** | 복잡한 작업은 `high` 또는 `xhigh` 설정 |
| **상태 업데이트** | 1-2문장, 1-3단계마다 업데이트 (마일스톤은 길게) |

---

## 15절. 반복업무 자동화

### 비대화형 실행/스크립트화 + 안전 승인 흐름

### `codex exec` — 비대화형 실행의 핵심

```bash
# 기본 사용
codex exec "리포지토리의 TODO 주석을 모두 찾아 정리해줘"

# 전체 자동화 모드
codex exec --full-auto "린트 오류를 전부 수정해줘"

# JSON Lines 출력 (파이프라인 연동)
codex exec --json "보안 취약점을 스캔해줘" | jq '.type'

# 구조화된 출력 (스키마 정의)
codex exec --output-schema schema.json "릴리스 노트를 작성해줘"
```

### 정해진 산출물 뽑기 — 스크립트 예시

#### 예시 1: 일일 코드 품질 리포트

```bash
#!/bin/bash
# daily-quality-report.sh

DATE=$(date +%Y-%m-%d)
OUTPUT="reports/quality-${DATE}.md"

codex exec -o "$OUTPUT" "다음을 수행하고 결과를 마크다운으로 정리해줘:
1. npm run lint 실행 결과 (경고/오류 수)
2. npm test 실행 결과 (통과/실패 수)
3. 코드 커버리지 요약
4. 최근 5개 커밋의 변경 요약
제목은 '${DATE} 코드 품질 리포트'"

echo "리포트 생성 완료: $OUTPUT"
```

#### 예시 2: PR 설명 자동 생성

```bash
#!/bin/bash
# auto-pr-description.sh

BRANCH=$(git branch --show-current)
DIFF=$(git diff main...HEAD --stat)

codex exec -o pr-description.md "현재 브랜치 '${BRANCH}'의 변경 사항을 분석하고
PR 설명을 작성해줘.

변경 통계:
${DIFF}

포함할 내용:
- 변경 요약 (2-3줄)
- 주요 변경 사항 (bullet point)
- 테스트 계획
- 리뷰어 참고사항"
```

#### 예시 3: 변경 로그 자동 업데이트

```bash
#!/bin/bash
# update-changelog.sh

codex exec --full-auto "CHANGELOG.md를 업데이트해줘.
마지막 릴리스 태그 이후의 모든 커밋을 분석하고,
Keep a Changelog 형식으로 Added/Changed/Fixed/Removed를 분류해줘."
```

### 안전 승인 흐름

| 수준 | 플래그 | 설명 | 적합한 환경 |
|---|---|---|---|
| **최대 안전** | (기본) | 모든 행동에 승인 필요 | 프로덕션 코드 |
| **중간** | `--full-auto` | workspace-write + 요청 시 승인 | 개발 환경 |
| **최소** | `--yolo` | 모든 승인 우회 | 격리된 CI/CD 러너 |

> `--yolo`(`--dangerously-bypass-approvals-and-sandbox`)는 반드시 **격리된 환경(컨테이너, CI 러너)** 에서만 사용한다.

### GitHub Actions 통합

```yaml
# .github/workflows/codex-review.yml
name: Codex Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: openai/codex-action@v1
        with:
          prompt: "이 PR의 변경 사항을 리뷰해줘"
          sandbox: "read-only"
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### 자동화 설계 원칙

1. **최소 권한 원칙** — 자동화에는 필요한 최소 권한만 부여
2. **실패 시 안전** — 오류 시 중단하고 알림 (exit code 활용)
3. **로그 보존** — 모든 Codex 실행 결과를 기록
4. **점진적 확대** — read-only → workspace-write → full-auto 순서로 신뢰 구축

---

### 참고 출처

- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
- [Codex Non-interactive Mode](https://developers.openai.com/codex/noninteractive/)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [Codex Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide/)
- [PLANS.md for Multi-hour Solving](https://developers.openai.com/cookbook/articles/codex_exec_plans/)
- [Codex GitHub Action](https://developers.openai.com/codex/github-action/)
- [Long Horizon Tasks Cookbook](https://developers.openai.com/cookbook/examples/codex/long_horizon_tasks/)
