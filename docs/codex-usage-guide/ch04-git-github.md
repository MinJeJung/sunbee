# 4장. Git·GitHub로 결과물 관리

> 문서/코드 공통 — commit·push·PR을 Codex와 연결하기

---

## 16절. Git/GitHub 핵심 10개 (비개발자용)

### 개발자가 아니어도 알아야 할 Git/GitHub 용어 10가지

Git은 파일의 변경 이력을 추적하는 도구이고, GitHub은 그 이력을 팀과 공유하는 온라인 서비스다. Codex를 실무에서 쓰려면 이 10가지 개념을 이해해야 한다.

### 1. Repository (저장소, 줄여서 repo)

**비유:** 프로젝트의 "서류 보관함"

```
하나의 프로젝트 = 하나의 저장소
저장소 안에 코드, 문서, 설정 파일 등이 모두 들어 있다
```

- **로컬 저장소**: 내 컴퓨터에 있는 프로젝트 폴더
- **원격 저장소**: GitHub에 올라가 있는 프로젝트 (팀 공유용)

### 2. Clone (복제)

**비유:** GitHub의 프로젝트를 내 컴퓨터에 "복사"해오는 것

```bash
git clone https://github.com/team/project.git
# → 내 컴퓨터에 project/ 폴더가 생긴다
```

### 3. Branch (브랜치, 가지)

**비유:** 원본을 건드리지 않고 "평행 세계"에서 작업하는 것

```bash
git checkout -b feature/login-page
# → "login-page 기능 작업용" 브랜치 생성
```

- `main` (또는 `master`): 공식 버전이 있는 브랜치
- `feature/xxx`: 새 기능을 작업하는 브랜치
- 작업이 끝나면 main에 합친다 (merge)

### 4. Commit (커밋)

**비유:** 게임의 "세이브 포인트"

```bash
git add login.ts              # 변경한 파일을 스테이징
git commit -m "로그인 폼 추가"  # 세이브 (설명 메시지 포함)
```

- 나중에 이 시점으로 돌아올 수 있다
- 커밋 메시지는 "무엇을 왜 변경했는지" 간결히 쓴다

### 5. Push (푸시)

**비유:** 내 컴퓨터의 세이브를 "클라우드에 업로드"

```bash
git push origin feature/login-page
# → GitHub에 내 작업이 올라간다
```

### 6. Pull Request (PR)

**비유:** "이 변경사항을 공식 버전에 반영해주세요"라는 요청서

```
PR = 변경 요약 + 코드 diff + 리뷰 요청
```

- PR을 만들면 팀원들이 코드를 리뷰한다
- 리뷰 통과 후 merge(합치기)한다
- Codex가 PR 설명을 자동 생성할 수 있다

### 7. Merge (병합)

**비유:** 브랜치에서 완성한 작업을 "공식 버전에 합치기"

```
feature/login-page → main 으로 merge
= "로그인 기능이 공식 반영됨"
```

### 8. Issue (이슈)

**비유:** 프로젝트의 "할 일 목록" 또는 "버그 신고 게시판"

```
Issue #42: "로그인 시 비밀번호 5회 실패 후 잠금 기능 추가"
```

- 기능 요청, 버그 신고, 개선 제안을 기록
- PR과 연결하여 "이 PR은 Issue #42를 해결한다" 명시 가능

### 9. Conflict (충돌)

**비유:** 두 사람이 같은 줄을 다르게 수정한 상황

```
A가 수정: const name = "Alice"
B가 수정: const name = "Bob"
→ Git이 "어떤 걸 선택할지 모르겠다"고 알림
```

- 충돌이 발생하면 수동으로 어떤 변경을 유지할지 결정
- 충돌을 줄이려면: 작은 단위로 자주 커밋+푸시

### 10. Tag (태그)

**비유:** 특정 커밋에 "이름표"를 붙이기

```bash
git tag v1.0.0
# → 이 시점을 "버전 1.0.0"으로 기록
```

- 릴리스 버전을 표시할 때 사용
- `v1.0.0`, `v1.1.0` 등의 형식

---

## 17절. 표준 SOP

### pull→branch→Codex 작업→diff→commit→push→PR→merge

### 전체 워크플로 다이어그램

```
[1] git pull        최신 코드 가져오기
     ↓
[2] git checkout -b  작업 브랜치 생성
     ↓
[3] codex            Codex로 작업 수행
     ↓
[4] git diff         변경 사항 확인
     ↓
[5] git commit       변경 저장 (세이브)
     ↓
[6] git push         GitHub에 업로드
     ↓
[7] PR 생성          리뷰 요청
     ↓
[8] merge            공식 반영
```

### 각 단계 상세

#### Step 1: 최신 코드 가져오기

```bash
# main 브랜치에서 최신 상태로 업데이트
git checkout main
git pull origin main
```

#### Step 2: 작업 브랜치 생성

```bash
# 이슈 번호와 설명으로 브랜치명 작성
git checkout -b feature/42-rate-limiting
```

**브랜치 이름 규칙 (예시):**

| 유형 | 패턴 | 예시 |
|---|---|---|
| 기능 추가 | `feature/이슈번호-설명` | `feature/42-rate-limiting` |
| 버그 수정 | `fix/이슈번호-설명` | `fix/57-login-error` |
| 문서 작업 | `docs/설명` | `docs/api-guide-update` |

#### Step 3: Codex로 작업

```bash
# Codex 시작
codex

# 또는 비대화형으로 실행
codex exec "Issue #42: rate limiting 기능을 추가해줘.
src/middleware/rate-limiter.ts를 생성하고,
src/routes/auth.ts에 적용해줘."
```

#### Step 4: 변경 사항 확인

```bash
# 변경된 파일 목록
git status

# 상세 변경 내용
git diff

# Codex에게 변경 요약 요청 (대화형 모드에서)
# "지금까지의 변경 사항을 요약해줘"
```

#### Step 5: 커밋

```bash
# 변경 파일 스테이징
git add src/middleware/rate-limiter.ts
git add src/routes/auth.ts
git add tests/rate-limiter.test.ts

# 커밋 (관례에 맞는 메시지)
git commit -m "feat: IP 기반 rate limiting 추가 (#42)"
```

#### Step 6: 푸시

```bash
git push -u origin feature/42-rate-limiting
```

#### Step 7: PR 생성

GitHub 웹사이트에서 "New Pull Request" 클릭, 또는 CLI:

```bash
gh pr create --title "feat: Rate limiting 추가" \
  --body "## 변경 요약
- IP당 15분 100회 제한 추가
- auth 라우트에 미들웨어 적용

## 테스트
- npm test 통과 확인
- 101번째 요청에서 429 응답 확인

Closes #42"
```

#### Step 8: Merge

- 리뷰어의 승인을 받은 후 merge
- Squash merge: 여러 커밋을 하나로 합쳐 정리
- main 브랜치에 반영됨

---

## 18절. Codex로 "PR 단위 작업" 만들기

### 변경 요약/검증 로그/PR 설명 초안 자동 생성

### PR을 위한 Codex 활용 패턴

#### 1. 변경 요약 자동 생성

```
현재 브랜치에서 main 이후의 모든 변경을 분석하고,
PR 설명에 적합한 변경 요약을 작성해줘.
다음 형식을 따라:
- **변경 요약**: 2-3줄 개요
- **주요 변경**: bullet point 목록
- **영향 범위**: 어떤 기능에 영향을 미치는지
```

#### 2. 검증 로그 생성

```
다음 검증을 실행하고 결과를 PR 설명에 포함할 수 있게 정리해줘:
1. 린트 검사 결과
2. 타입 체크 결과
3. 유닛 테스트 결과 (통과/실패 수)
4. 빌드 성공 여부
```

#### 3. PR 설명 초안 자동 생성

```bash
# codex exec으로 PR 설명 파일 생성
codex exec -o pr-description.md "현재 브랜치의 git diff main...HEAD를 분석하고,
다음 형식의 PR 설명을 작성해줘:

## 요약
(2-3줄)

## 변경 사항
- 추가: ...
- 수정: ...
- 삭제: ...

## 테스트 계획
- [ ] ...

## 스크린샷
(해당 시)

## 관련 이슈
Closes #이슈번호"
```

#### 4. 커밋 메시지 자동 생성

```
현재 스테이징된 변경 사항을 분석하고,
Conventional Commits 형식의 커밋 메시지를 제안해줘.

형식: <type>(<scope>): <description>
예: feat(auth): add rate limiting middleware
```

### PR 크기 관리

| PR 크기 | 권장 | 이유 |
|---|---|---|
| ~200줄 이하 | 이상적 | 빠른 리뷰 가능 |
| 200~500줄 | 적정 | 한 번에 리뷰 가능 |
| 500줄 이상 | 분할 필요 | 리뷰 품질 저하 |

큰 작업은 여러 PR로 분할:

```
이 리팩토링 작업을 3개의 PR로 나눌 수 있게
작업 계획을 세워줘:
PR 1: 인터페이스 정의 변경
PR 2: 기존 코드를 새 인터페이스로 마이그레이션
PR 3: 레거시 코드 제거 + 테스트 업데이트
```

---

## 19절. 리뷰 대응 자동화

### 리뷰 코멘트 정리→수정안 반영→재검증→업데이트 커밋

### GitHub에서 Codex 리뷰 활용

PR 코멘트에 `@codex review`를 작성하면, Codex가 자동으로 코드 리뷰를 수행한다.

### 리뷰 대응 워크플로

#### Step 1: 리뷰 코멘트 정리

```
이 PR의 리뷰 코멘트를 분석하고 정리해줘:
1. 필수 수정 사항 (반드시 반영)
2. 제안 사항 (선택적 반영)
3. 질문 (답변 필요)
각 항목에 대한 대응 계획도 작성해줘.
```

#### Step 2: 수정안 반영

```
리뷰 코멘트에 따라 다음을 수정해줘:
1. [필수] error handler에서 에러 타입 구체화 (reviewer A 코멘트)
2. [필수] rate-limiter 설정을 환경 변수로 분리 (reviewer B 코멘트)
3. [제안] 주석 추가 — rate limiting 알고리즘 설명
```

#### Step 3: 재검증

```
수정 후 다음을 확인해줘:
1. npm test 전체 통과
2. npm run lint 오류 없음
3. 리뷰 코멘트에서 지적된 케이스가 해결되었는지 검증
```

#### Step 4: 업데이트 커밋

```bash
git add -A
git commit -m "fix: address review feedback - error types and config extraction"
git push
```

### @codex 멘션으로 PR 협업

GitHub에서 `@codex`를 멘션하여 다양한 협업이 가능하다:

```
@codex 이 PR의 성능 영향을 분석해줘
@codex 이 변경에 대한 테스트 케이스를 제안해줘
@codex 이 리뷰 코멘트에 대한 수정안을 만들어줘
```

---

## 20절. 되돌리기/충돌 해결

### restore/reset/revert + conflict 최소화 운영 규칙

### 되돌리기 3형제

#### 1. `git restore` — 작업 중인 파일 되돌리기

```bash
# 특정 파일의 수정 사항 취소 (아직 commit하지 않은 것)
git restore src/routes/auth.ts

# 스테이징 해제 (add 취소)
git restore --staged src/routes/auth.ts
```

**쉬운 비유:** 작성 중인 문서에서 Ctrl+Z를 누르는 것

#### 2. `git reset` — 커밋 되돌리기

```bash
# 마지막 커밋 취소 (변경 내용은 유지)
git reset --soft HEAD~1

# 마지막 커밋 취소 (변경 내용도 스테이징 해제)
git reset HEAD~1

# 마지막 커밋 취소 (변경 내용 삭제 — 위험!)
git reset --hard HEAD~1
```

**쉬운 비유:** 게임의 세이브 포인트를 삭제하고 이전으로 돌아가는 것

> `--hard`는 변경 내용이 사라지므로 주의! 반드시 확인 후 사용.

#### 3. `git revert` — 안전하게 되돌리기

```bash
# 특정 커밋의 변경을 "취소하는 새 커밋" 생성
git revert abc1234
```

**쉬운 비유:** "이전에 한 변경을 되돌립니다"라는 새 기록을 남기는 것

| 명령어 | 위험도 | 이력 | 추천 상황 |
|---|---|---|---|
| `restore` | 낮음 | 유지 | 작업 중 파일 취소 |
| `reset --soft` | 중간 | 삭제 | 로컬 커밋 재정리 |
| `reset --hard` | 높음 | 삭제 | 로컬에서만 사용 |
| `revert` | 낮음 | 유지 | push된 커밋 되돌리기 |

### 충돌(Conflict) 해결

#### 충돌이 발생하는 상황

```
A: auth.ts 5번째 줄을 "timeout: 30" 으로 수정
B: auth.ts 5번째 줄을 "timeout: 60" 으로 수정
→ 두 수정이 동시에 merge 시 충돌!
```

#### 충돌 해결 방법

```bash
# 1. 충돌 파일 확인
git status
# → "both modified: src/routes/auth.ts"

# 2. 파일을 열면 충돌 표시가 보임
<<<<<<< HEAD
const timeout = 30;
=======
const timeout = 60;
>>>>>>> feature/longer-timeout

# 3. 원하는 버전을 선택하고 충돌 표시 삭제
const timeout = 60;  # 예: B의 변경을 선택

# 4. 해결 후 커밋
git add src/routes/auth.ts
git commit -m "resolve: merge conflict - timeout 60초로 결정"
```

#### Codex로 충돌 해결

```
현재 merge 충돌이 발생한 파일들을 분석해줘.
각 충돌에 대해:
1. 양쪽 변경의 의도를 설명
2. 추천 해결 방안 제시
3. 선택 후 테스트 필요 여부
```

### 충돌 최소화 운영 규칙

| 규칙 | 설명 |
|---|---|
| **작은 PR** | PR 크기를 작게 유지하면 충돌 확률 감소 |
| **자주 pull** | main 브랜치를 자주 가져와서 차이를 줄이기 |
| **영역 분담** | 팀원별 담당 파일/모듈을 분리 |
| **빠른 merge** | PR 승인 후 빠르게 merge하여 체류 시간 줄이기 |
| **커뮤니케이션** | 같은 파일 수정 시 사전 소통 |

### Codex 작업 후 안전한 운영 패턴

```bash
# 1. Codex 작업 전: 체크포인트 만들기
git add -A && git commit -m "checkpoint: before codex task"

# 2. Codex 작업 수행
codex exec "..."

# 3. 결과 확인
git diff

# 4-A. 결과가 좋으면: 커밋
git add -A && git commit -m "feat: codex-generated changes"

# 4-B. 결과가 나쁘면: 되돌리기
git restore .
# 또는
git reset --hard HEAD
```

---

### 참고 출처

- [Git 공식 문서 — Basics](https://git-scm.com/book/ko/v2)
- [GitHub Docs — Pull Requests](https://docs.github.com/en/pull-requests)
- [Codex GitHub Integration](https://developers.openai.com/codex/integrations/github)
- [Codex GitHub Action](https://developers.openai.com/codex/github-action/)
- [Codex Workflows](https://developers.openai.com/codex/workflows/)
