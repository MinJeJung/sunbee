# 2장. 설치·사양·첫 실행

> 초보자도 "왜 필요한지" 이해하게 — 설치부터 첫 성공까지

---

## 6절. 설치 사양을 쉬운 말로

### OS/권한/저장공간/네트워크/회사PC 제약 체크

Codex CLI를 설치하기 전에 아래 사항을 확인한다. 기술 용어를 최대한 쉬운 말로 풀었다.

### 운영체제 (OS)

| OS | 지원 여부 | 설명 |
|---|---|---|
| **macOS** | 지원 | Mac 사용자는 바로 설치 가능 |
| **Linux** | 지원 | Ubuntu, Debian 등 주요 배포판 지원 |
| **Windows** | WSL 필요 | Windows 안에 Linux 환경(WSL)을 먼저 설치해야 함 |

> **WSL이란?** Windows Subsystem for Linux의 약자. Windows 안에서 Linux를 실행할 수 있게 해주는 Microsoft 공식 기능이다.

### 필요한 프로그램

| 프로그램 | 왜 필요한가 | 버전 |
|---|---|---|
| **Node.js** | Codex 설치 도구(npm)를 실행하기 위해 | 18 이상 |
| **npm** | Codex를 다운로드하고 설치하기 위해 | Node.js에 포함 |
| **Git** | 코드 버전 관리 (Codex가 변경사항을 추적) | 최신 버전 권장 |
| **Homebrew** (macOS) | macOS 전용 설치 관리자 (선택사항) | 최신 |

> npm이 없어도 Homebrew(`brew install --cask codex`)나 GitHub Releases에서 바이너리를 직접 다운로드할 수 있다.

### 저장 공간

| 항목 | 필요 용량 |
|---|---|
| Codex CLI 자체 | ~50MB |
| Node.js + npm | ~100MB |
| 작업 공간 (프로젝트) | 프로젝트에 따라 다름 |

### 네트워크

| 항목 | 설명 |
|---|---|
| **인터넷 연결** | 설치 시 필수, 실행 시에도 OpenAI API 접속 필요 |
| **HTTPS 통신** | OpenAI 서버와 암호화된 통신 사용 |
| **프록시/VPN** | 회사 네트워크에서 프록시 설정이 필요할 수 있음 |

### 회사 PC 제약 체크

| 제약 사항 | 확인 방법 | 해결 방법 |
|---|---|---|
| npm 전역 설치 차단 | `npm i -g` 실행 시 권한 오류 | IT팀에 요청 또는 npx 사용 |
| 외부 네트워크 차단 | OpenAI API 접속 불가 | 방화벽 예외 요청 |
| 관리자 권한 없음 | 소프트웨어 설치 불가 | GitHub에서 바이너리 다운로드 |
| 보안 소프트웨어 충돌 | Codex 실행 차단 | 보안팀에 예외 등록 요청 |

---

## 7절. 설치: macOS·Linux·Windows(WSL)별 플로우

### macOS 설치

#### 방법 1: npm (Node.js 사용자)

```bash
# 1. Node.js가 설치되어 있는지 확인
node --version  # v18 이상이어야 함

# 2. Codex CLI 전역 설치
npm install -g @openai/codex

# 3. 설치 확인
codex --version
```

#### 방법 2: Homebrew (Mac 사용자에게 추천)

```bash
# 1. Homebrew가 설치되어 있는지 확인
brew --version

# 2. Codex 설치
brew install --cask codex

# 3. 설치 확인
codex --version
```

#### 방법 3: 바이너리 직접 다운로드

1. [GitHub Releases](https://github.com/openai/codex/releases) 페이지 접속
2. 최신 릴리스에서 macOS용 바이너리 다운로드
3. 다운로드한 파일에 실행 권한 부여: `chmod +x codex`
4. PATH에 등록하거나 직접 실행

### Linux 설치

```bash
# 1. Node.js 설치 (Ubuntu/Debian)
sudo apt update
sudo apt install -y nodejs npm

# 또는 nvm으로 설치 (권장)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18

# 2. Codex CLI 전역 설치
npm install -g @openai/codex

# 3. 설치 확인
codex --version
```

### Windows (WSL) 설치

```powershell
# Step 1: WSL 설치 (PowerShell을 관리자 권한으로 실행)
wsl --install

# 컴퓨터를 재시작한 후 WSL 터미널 열기
```

```bash
# Step 2: WSL 안에서 (Ubuntu 터미널)
# Node.js 설치
sudo apt update
sudo apt install -y nodejs npm

# Step 3: Codex CLI 설치
npm install -g @openai/codex

# Step 4: 확인
codex --version
```

### 업데이트

```bash
# npm으로 설치한 경우
npm update -g @openai/codex

# Homebrew로 설치한 경우
brew upgrade --cask codex
```

### 삭제

```bash
# npm으로 설치한 경우
npm uninstall -g @openai/codex

# Homebrew로 설치한 경우
brew uninstall --cask codex

# 설정 파일 삭제 (선택)
rm -rf ~/.codex
```

---

## 8절. 인증: ChatGPT 로그인 vs API Key

### 두 가지 인증 방식

Codex는 두 가지 방법으로 인증할 수 있다. 팀 정책과 사용 목적에 따라 선택한다.

### 방식 1: ChatGPT 로그인 (OAuth)

```bash
# Codex 첫 실행 시 자동으로 로그인 프롬프트가 나타남
codex

# 또는 명시적으로 로그인
codex login
```

| 항목 | 설명 |
|---|---|
| **적합한 대상** | 개인 사용자, ChatGPT 구독자 |
| **지원 플랜** | Plus, Pro, Business, Edu, Enterprise |
| **장점** | 별도 API 키 관리 불필요, 구독에 포함된 사용량 |
| **단점** | 팀 단위 관리가 어려움, 자동화에 부적합 |
| **모델 접근** | 최신 Codex 모델(gpt-5.3-codex 등) 자동 사용 |

### 방식 2: API Key

```bash
# 환경 변수에 API 키 설정
export OPENAI_API_KEY="sk-..."

# 또는 로그인 시 API 키 입력
codex login  # API key 옵션 선택
```

| 항목 | 설명 |
|---|---|
| **적합한 대상** | 팀/조직, CI/CD 자동화, 스크립트 |
| **비용** | API 사용량에 따른 종량제 |
| **장점** | 팀 단위 관리 가능, 자동화에 적합 |
| **단점** | 키 보안 관리 필요, 비용 예측 어려울 수 있음 |
| **모델 접근** | API에서 지원하는 모델 사용 |

### 팀 정책 결정 가이드

```
개인 학습/실험 용도?
  → ChatGPT 로그인 (Plus $20/월이면 충분)

팀에서 공식 도입?
  → API Key + 조직 계정
  → 비용 한도(Usage Limit) 설정 필수
  → 키 로테이션 정책 수립

CI/CD 자동화 통합?
  → API Key 필수
  → 환경 변수 또는 시크릿 관리자로 키 관리
  → GitHub Actions Secret에 저장
```

### 인증 관련 주의사항

1. **API 키는 절대 코드에 직접 넣지 않는다** — 환경 변수나 시크릿 관리자 사용
2. **팀 키와 개인 키를 분리한다** — 비용 추적과 보안을 위해
3. **사용량 알림을 설정한다** — 예상치 못한 비용 발생 방지
4. **퇴사자의 키는 즉시 폐기한다** — 보안 사고 예방

---

## 9절. 작업 폴더/리포지토리 세팅

### docs/templates/examples 구조 + 안전한 샌드박스 만들기

### 권장 프로젝트 구조

```
my-project/
├── .codex/                    # Codex 프로젝트 설정
│   └── config.toml            # 프로젝트별 Codex 설정
├── docs/                      # 문서
│   ├── templates/             # 재사용 템플릿
│   │   ├── prd-template.md    # PRD 템플릿
│   │   ├── ac-template.md     # 수용기준 템플릿
│   │   └── review-template.md # 리뷰 체크리스트
│   └── examples/              # 예시/샘플
│       ├── sample-prd.md      # PRD 예시
│       └── sample-spec.md     # 스펙 예시
├── AGENTS.md                  # Codex 에이전트 지시 파일 (전역)
├── src/                       # 소스 코드
├── tests/                     # 테스트 코드
└── README.md
```

### AGENTS.md 설정

`AGENTS.md`는 Codex가 프로젝트에서 작업할 때 참고하는 전역 지시 파일이다. 프로젝트 루트에 생성한다.

```markdown
# AGENTS.md

## 프로젝트 개요
이 프로젝트는 [간략한 설명]입니다.

## 코딩 규칙
- 들여쓰기: 스페이스 2칸
- 변수명: camelCase
- 함수명: 동사로 시작 (예: getUserData)

## 테스트 방법
- `npm test`로 전체 테스트 실행
- `npm run lint`로 린트 검사

## 파일 구조 안내
- src/: 소스 코드
- tests/: 테스트 코드
- docs/: 문서
```

### 안전한 샌드박스 만들기

Codex로 실험할 때는 **별도의 샌드박스 디렉토리**를 만들어 안전하게 테스트한다.

```bash
# 1. 샌드박스 디렉토리 생성
mkdir -p ~/codex-sandbox
cd ~/codex-sandbox

# 2. Git 초기화 (변경 사항 추적용)
git init

# 3. 기본 파일 생성
echo "# Codex 연습장" > README.md
git add README.md
git commit -m "Initial commit"

# 4. Codex를 read-only 모드로 시작 (가장 안전)
codex --sandbox read-only
```

### 샌드박스 모드 설명

| 모드 | 설명 | 추천 상황 |
|---|---|---|
| `read-only` | 파일 읽기만 가능, 수정/실행 불가 | 첫 사용, 코드 탐색 |
| `workspace-write` | 작업 디렉토리 내 파일 수정 가능 | 일반 개발 작업 |
| `danger-full-access` | 모든 접근 허용 (위험) | 격리된 CI/CD 환경에서만 |

### config.toml 기본 설정

```toml
# ~/.codex/config.toml

# 기본 모델 설정
model = "gpt-5.3-codex"

# 기본 샌드박스 모드
sandbox = "workspace-write"

# 승인 모드 (항상 확인, 오류 시만 확인, 요청 시만)
approval_mode = "on-failure"

# 웹 검색 설정
web_search = "cached"
```

---

## 10절. 첫 성공 경험 (15분 실습)

### "문서 1개 생성→수정→실행 검증→변경 요약" 완주

이 실습은 Codex의 핵심 기능을 15분 안에 체험하는 것을 목표로 한다.

### 사전 준비 (2분)

```bash
# 1. 연습용 폴더 만들기
mkdir -p ~/codex-first-run
cd ~/codex-first-run

# 2. Git 초기화
git init
echo "# My First Codex Project" > README.md
git add README.md
git commit -m "Initial commit"

# 3. Codex 시작
codex
```

### 실습 1: 문서 생성 (3분)

Codex 대화창에 다음을 입력한다:

```
docs/ 폴더에 meeting-notes.md 파일을 만들어줘.
내용은 "2024년 1분기 제품 기획 회의록"이고,
참석자 3명, 안건 3개, 결정사항 2개를 포함해줘.
```

**확인할 점:**
- [ ] docs/ 폴더가 생성되었는가?
- [ ] meeting-notes.md 파일의 내용이 요청대로인가?
- [ ] 마크다운 형식이 올바른가?

### 실습 2: 문서 수정 (3분)

```
meeting-notes.md에 "후속 작업(Action Items)" 섹션을 추가해줘.
담당자, 마감일, 상태(미시작/진행중/완료)를 표로 정리해줘.
```

**확인할 점:**
- [ ] 기존 내용은 유지되었는가?
- [ ] 새 섹션이 적절한 위치에 추가되었는가?
- [ ] 표 형식이 올바른가?

### 실습 3: 실행 검증 (4분)

```
다음을 확인해줘:
1. meeting-notes.md의 마크다운 문법이 올바른지 검사
2. 파일에 오타가 없는지 확인
3. 결과를 요약해서 알려줘
```

**확인할 점:**
- [ ] Codex가 파일을 다시 읽었는가?
- [ ] 검사 결과를 보고했는가?
- [ ] 문제가 있으면 수정을 제안했는가?

### 실습 4: 변경 요약 (3분)

```
지금까지 만든 모든 변경 사항을 요약해줘.
git diff 형태로 보여주고, 커밋 메시지도 제안해줘.
```

**확인할 점:**
- [ ] 변경된 파일 목록이 정확한가?
- [ ] diff가 실제 변경 내용과 일치하는가?
- [ ] 커밋 메시지가 명확하고 관례에 맞는가?

### 실습 완료 후 정리

```bash
# 변경 사항 확인
git status
git diff

# 커밋 (Codex가 제안한 메시지 사용)
git add .
git commit -m "docs: 2024 Q1 제품 기획 회의록 추가"
```

### 15분 실습에서 배운 것

| 배운 것 | 대응하는 Codex 기능 |
|---|---|
| 파일 생성 | 읽기→수정 흐름의 "수정" 단계 |
| 파일 수정 | 기존 파일의 일부만 변경하는 정밀 편집 |
| 검증 | 실행/검증 루틴 |
| 요약 | diff 생성 + 커밋 메시지 작성 |

> **다음 단계:** 3장에서 실무형 지시문 템플릿을 배우면, 더 복잡한 작업도 이와 같은 흐름으로 처리할 수 있다.

---

### 참고 출처

- [Codex Quickstart](https://developers.openai.com/codex/quickstart/)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference/)
- [Codex CLI GitHub](https://github.com/openai/codex)
- [Codex CLI Features](https://developers.openai.com/codex/cli/features/)
