# 5장. PRD를 Codex로 만드는 법 (사례 중심)

> "PRD 5절 = Codex 기능 매핑" — 각 PRD 단계에서 Codex를 어떻게 활용하는가

---

## 21절. PRD 킥오프

### 목차·골격 자동 생성

#### 활용 기능
- **파일 생성/편집**: Codex가 PRD 템플릿 구조를 즉시 생성
- **기존 문서 읽기→구조화**: 회의록, 리서치 자료를 읽고 PRD 골격에 매핑
- **멀티 에이전트 패턴**: Agents SDK로 PM 에이전트가 자동 생성

#### Codex로 PRD 골격 만들기

```
[목표] 신규 기능 PRD 뼈대를 작성한다.

[산출물] docs/prd/feature-name.md

[제약]
- docs/templates/prd-template.md 형식을 따른다
- 아래 참고 자료를 반영한다:
  @docs/meeting-notes/2024-01-kickoff.md
  @docs/research/competitive-analysis.md

[검증(AC)]
- 목표/범위/Non-goals/지표/일정 섹션이 모두 포함
- 참고 자료의 핵심 내용이 반영됨
```

#### PRD 표준 골격 (Codex 자동 생성 예시)

```markdown
# [기능명] PRD

## 1. 배경 및 목표
### 가설 (Hypothesis)
### 전략적 적합성 (Strategic Fit)

## 2. 범위 (Scope)
### In-Scope
### Out-of-Scope (Non-goals)

## 3. 사용자 시나리오
### As-Is (현재 상태)
### To-Be (목표 상태)
### 사용자 스토리

## 4. 요구사항 및 수용기준 (AC)
### 기능 요구사항
### 비기능 요구사항
### 예외 케이스

## 5. 설계 및 데이터
### 데이터 정의
### 정책 (보안/운영/로그)

## 6. 성공 지표
### KPI 정의
### 측정 방법

## 7. 출시 계획
### 롤아웃 단계
### 리스크 및 롤백

## 8. 일정
### 마일스톤
### 의존성
```

#### 멀티 관점 리뷰 (같은 스레드에서)

PRD 초안 생성 후, 같은 Codex 세션에서 **7가지 관점의 리뷰**를 요청할 수 있다:

```
위 PRD를 다음 관점에서 각각 리뷰해줘:
1. 엔지니어링: 기술적 실현 가능성, 공수 추정
2. 디자인: UX 일관성, 사용자 흐름 누락
3. QA: 테스트 가능성, 예외 케이스 누락
4. 보안: 데이터 보호, 권한 관리
5. 법무: 규정 준수, 개인정보 처리
6. 비즈니스: 수익 영향, 경쟁 우위
7. 운영: 모니터링, 장애 대응
```

> 7가지 관점의 피드백을 2분 만에 — 미팅 없이, 일정 조율 없이, 며칠 대기 없이.

#### 사례: "1시간 → 10분"

| 단계 | 기존 방식 | Codex 활용 |
|---|---|---|
| 템플릿 복사/정리 | 15분 | 1분 (자동 생성) |
| 참고 자료 읽기 | 20분 | 3분 (자동 요약+반영) |
| 초안 작성 | 25분 | 5분 (구조화된 초안) |
| 형식 검수 | 10분 | 1분 (자동 검증) |
| **합계** | **~70분** | **~10분** |

#### Agents SDK 멀티 에이전트 패턴

Codex CLI를 MCP 서버로 사용하면, Agents SDK로 **PM 에이전트**를 구성할 수 있다:

| 산출물 | 설명 |
|---|---|
| `REQUIREMENTS.md` | 제품 목표, 대상 사용자, 핵심 기능, 제약 조건 요약 |
| `TEST.md` | `[Owner]` 태그가 붙은 태스크 + 수용기준 |
| `AGENT_TASKS.md` | 역할별 섹션 (디자이너/프론트엔드/백엔드/QA) |

PM 에이전트가 이 문서들을 "단일 진실의 원천(Single Source of Truth)"으로 사용하며, 디자이너·프론트엔드·백엔드·QA 에이전트에게 핸드오프한다.

---

## 22절. 문제정의·가설·사용자 시나리오 (As-Is/To-Be)

### 자료 요약→인사이트 추출→시나리오화

#### 활용 기능
- **자료(회의록/CS/VOC) 요약**: 대량 텍스트를 읽고 핵심만 추출
- **인사이트 추출**: 패턴 발견, 주요 문제 순위화
- **시나리오 생성**: As-Is/To-Be 매핑, 사용자 여정 작성

#### VOC 데이터에서 인사이트 추출

```
다음 VOC 데이터를 분석해줘:
@data/voc/cs-tickets-q4.csv
@data/voc/user-interviews.md
@data/voc/nps-comments.txt

1단계: 카테고리별 주요 불만(Pain Points)을 Top 10으로 정리
2단계: 각 불만의 빈도, 심각도, 영향 범위를 표로 정리
3단계: Top 3 Pain Point에 대한 사용자 여정(User Journey) 작성
4단계: 각 여정에서 핵심 과업(Top Tasks)을 도출
```

#### 사용자 시나리오 생성 (As-Is/To-Be)

```
"비밀번호 재설정" 기능에 대해 다음을 작성해줘:

[As-Is 시나리오]
- 현재 사용자가 비밀번호를 잊었을 때 겪는 전체 과정
- 각 단계에서의 불편/이탈 포인트

[To-Be 시나리오]
- 개선 후 사용자 경험
- 각 단계에서의 개선 효과

[핵심 차이]
- As-Is와 To-Be의 주요 차이점 비교표
```

#### 사례: VOC → Top Pain Points → 유저저니 → Top Tasks

| 단계 | 입력 | Codex 출력 |
|---|---|---|
| **수집** | CS 티켓 500건 + NPS 댓글 200개 | — |
| **분석** | — | Top 10 Pain Points (빈도/심각도 정렬) |
| **매핑** | — | Pain Point별 사용자 여정 (5~7단계) |
| **도출** | — | 핵심 과업 15개 (우선순위 포함) |

#### PLANS.md의 Discovery 섹션 활용

장기 프로젝트에서는 PLANS.md의 **Surprises & Discoveries** 섹션에 인사이트를 기록한다:

```markdown
### Surprises & Discoveries
- CS 데이터 분석 결과: 결제 오류의 78%가 모바일에서 발생
- 사용자 인터뷰에서 "알림 피로도"가 예상보다 높은 것으로 확인
- 경쟁사 분석: A사는 비밀번호 없는 로그인(passwordless)을 도입하여 이탈률 30% 감소
```

#### PM 스킬 프레임워크

커뮤니티에서 제공하는 [Product-Manager-Skills](https://github.com/deanpeters/Product-Manager-Skills)는 46가지 PM 프레임워크를 Codex 스킬로 제공한다:

- 사용자 스토리 작성
- 포지셔닝 문서
- 에픽 정의
- 페르소나 생성
- PRD 전체 프로세스

---

## 23절. 요구사항/수용기준(AC)·예외케이스를 "테스트 가능한 문장"으로

### AC 자동 생성 + 예외/엣지케이스 리스트업 + 체크리스트화

#### 활용 기능
- **AC 자동 생성**: 기능 설명으로부터 수용기준을 자동 도출
- **예외/엣지케이스 리스트업**: 정상 시나리오 외의 모든 경우를 나열
- **체크리스트화**: 테스트 가능한 문장으로 변환

#### AC 생성 프롬프트

```
"소셜 로그인" 기능에 대한 수용기준(AC)을 작성해줘.

규칙:
- 각 AC는 "Given-When-Then" 형식으로 작성
- 정상 경로, 예외 경로, 에러 경로를 모두 포함
- 각 AC에 테스트 가능 여부를 [자동/수동]으로 표시
- 권한 규칙도 포함

카테고리:
1. 정상 흐름 (Happy Path)
2. 예외 흐름 (Exception Path)
3. 에러 처리 (Error Handling)
4. 권한/보안 (Permission/Security)
5. 성능/한계 (Performance/Limits)
```

#### 자동 생성되는 AC 예시

```markdown
### 소셜 로그인 수용기준

#### 1. 정상 흐름
| # | AC | 형식 | 테스트 |
|---|---|---|---|
| AC-1 | Given: 사용자가 Google 버튼 클릭 When: Google OAuth 인증 성공 Then: 홈 화면으로 리다이렉트되고 세션 생성 | Given-When-Then | [자동] |
| AC-2 | Given: 최초 소셜 로그인 사용자 When: 인증 성공 Then: 사용자 프로필 자동 생성 + 약관 동의 화면 표시 | Given-When-Then | [자동] |

#### 2. 예외 흐름
| # | AC | 형식 | 테스트 |
|---|---|---|---|
| AC-3 | Given: 동일 이메일로 기존 계정 존재 When: 소셜 로그인 시도 Then: "이미 가입된 이메일" 안내 + 계정 연결 옵션 표시 | Given-When-Then | [자동] |
| AC-4 | Given: 소셜 서비스 장애 When: OAuth 콜백 실패 Then: "일시적 오류" 메시지 + 재시도/이메일 로그인 안내 | Given-When-Then | [수동] |

#### 3. 에러 처리
| # | AC | 형식 | 테스트 |
|---|---|---|---|
| AC-5 | Given: OAuth 토큰 만료 When: 세션 갱신 시도 Then: 자동 재인증 또는 로그인 화면 이동 | Given-When-Then | [자동] |

#### 4. 권한/보안
| # | AC | 형식 | 테스트 |
|---|---|---|---|
| AC-6 | Given: 비활성화된 계정 When: 소셜 로그인 시도 Then: "비활성화된 계정" 안내 + 고객센터 링크 | Given-When-Then | [자동] |
```

#### 사례: 로그인/결제/알림 기능의 AC 전체 세트

```
다음 3개 기능에 대해 AC를 일괄 작성해줘:

1. 로그인 (이메일+비밀번호, 소셜, 2FA)
2. 결제 (카드, 계좌이체, 간편결제)
3. 알림 (푸시, 이메일, 인앱)

각 기능별로:
- 정상 시나리오 (3개 이상)
- 예외 시나리오 (5개 이상)
- 오류 메시지 목록 (코드+메시지+사용자 안내)
- 권한 규칙 (역할별 접근 범위)

출력은 기능별 마크다운 표로 정리해줘.
```

#### Codex가 자동 생성하는 테스트 관련 산출물

| 산출물 | Agents SDK 역할 | 설명 |
|---|---|---|
| `TEST.md` | PM 에이전트 | `[Owner]` 태그 + AC |
| `TEST_PLAN.md` | QA 에이전트 | 수동/자동 체크 목록 |
| `test.sh` | QA 에이전트 | 자동화된 테스트 스크립트 |

---

## 24절. 설계/데이터/정책까지 PRD에 포함시키기

### 파일 간 일관성 점검·표/정의서 자동 생성·변경 영향 범위 분석

#### 활용 기능
- **파일 간 일관성 점검**: 용어/정책이 문서 간 일관된지 확인
- **표/정의서 자동 생성**: 데이터 필드 정의, API 스키마, 정책 표
- **변경 영향 범위 분석**: 코드/문서 변경이 미치는 범위 파악

#### 용어/정책 일관성 점검

```
다음 문서들의 용어 일관성을 점검해줘:
@docs/prd/payment-v2.md
@docs/prd/user-auth.md
@docs/api/payment-api.md
@src/models/payment.ts

확인 사항:
1. 같은 개념에 다른 용어를 쓰고 있는 경우 (예: 사용자/유저/회원)
2. 필드명이 코드와 문서에서 다른 경우
3. 정책(보안/보관기간 등)이 문서 간 불일치하는 경우

결과를 불일치 항목 목록으로 정리하고, 통일 제안도 해줘.
```

#### 데이터 정의서 자동 생성

```
결제 기능의 데이터 정의서를 작성해줘.
@src/models/payment.ts를 참고하여 다음 표를 생성:

| 필드명 | 타입 | 설명 | 수집 시점 | 보관 기간 | 필수 여부 | 민감도 |
```

#### 생성되는 데이터 정의서 예시

```markdown
### 결제 데이터 정의서

| 필드명 | 타입 | 설명 | 수집 시점 | 보관 기간 | 필수 | 민감도 |
|---|---|---|---|---|---|---|
| payment_id | UUID | 결제 고유 식별자 | 결제 생성 시 | 영구 | Y | 낮음 |
| user_id | UUID | 결제자 식별자 | 결제 생성 시 | 영구 | Y | 중간 |
| amount | Decimal | 결제 금액 | 결제 요청 시 | 5년 | Y | 중간 |
| card_number | String | 카드 번호 (마스킹) | 결제 시 | 즉시 삭제* | Y | 높음 |
| card_token | String | 토큰화된 카드 정보 | 결제 완료 시 | 계정 삭제까지 | Y | 높음 |
| status | Enum | 결제 상태 | 상태 변경 시 | 영구 | Y | 낮음 |
| created_at | DateTime | 생성 일시 | 자동 | 영구 | Y | 낮음 |
| ip_address | String | 결제자 IP | 결제 시 | 90일 | N | 중간 |

*원본 카드번호는 토큰화 후 즉시 폐기
```

#### 권한/감사로그 요구사항 생성

```
결제 시스템의 권한 매트릭스와 감사로그 요구사항을 작성해줘.

[권한 매트릭스]
- 역할: 일반 사용자, 판매자, 운영자, 관리자
- 기능: 결제 생성, 결제 조회, 환불 처리, 정산 조회, 설정 변경

[감사로그 요구사항]
- 기록 대상 이벤트 목록
- 로그 포맷 (필드 정의)
- 보관 기간 정책
- 접근 권한
```

#### 생성되는 권한 매트릭스 예시

```markdown
### 권한 매트릭스

| 기능 | 일반 사용자 | 판매자 | 운영자 | 관리자 |
|---|---|---|---|---|
| 결제 생성 | O (본인) | X | X | X |
| 결제 조회 | O (본인) | O (자사) | O (전체) | O (전체) |
| 환불 처리 | X | X | O | O |
| 정산 조회 | X | O (자사) | O (전체) | O (전체) |
| 설정 변경 | X | X | X | O |
```

#### 변경 영향 범위 분석

```
결제 API의 응답 스키마에 refund_deadline 필드를 추가하면
영향받는 범위를 분석해줘:
1. 수정이 필요한 소스 파일 목록
2. 영향받는 테스트 파일
3. 업데이트가 필요한 문서
4. 관련된 다른 API 엔드포인트
5. 하위 호환성 영향 평가
```

#### Codex의 일관성 점검 능력

Codex는 AGENTS.md 레이어 시스템(OpenAI 자체 리포지토리에 88개의 AGENTS.md 파일 존재)을 통해 디렉토리별 규칙을 자동으로 적용한다. 코드 리뷰에서 LiveCodeBench 기준 **88%의 탐지율**로 버그, 보안 결함, 스타일 이슈를 발견한다.

---

## 25절. 측정·출시·운영 + PRD 최종 검수/버전관리

### 실행/검증 루틴 + 변경 요약 + PR/릴리스 노트 초안

#### 활용 기능
- **산출물 lint/포맷 검사**: 문서 형식 검증, 마크다운 문법 체크
- **변경 요약**: diff 기반 변경 내역 정리
- **PR/릴리스 노트 초안**: 자동 생성

#### 측정 체계 설계

```
다음 기능의 측정 체계를 설계해줘:

[기능] 소셜 로그인

1. 지표 정의 (KPI)
   - 핵심 지표 3개 + 보조 지표 5개
   - 각 지표의 정의, 산식, 측정 주기

2. 계측 이벤트 표
   - 이벤트명, 트리거 조건, 수집 파라미터, 전송 시점

3. A/B 테스트 계획
   - 대조군/실험군 분할 비율
   - 최소 표본 크기 (통계적 유의성 기준)
   - 실험 기간
   - 성공/실패 판단 기준

4. 롤백 절차
   - 위험 신호 정의 (자동 롤백 트리거)
   - 수동 롤백 단계
   - 롤백 후 데이터 처리 정책
```

#### 생성되는 계측 이벤트 표 예시

```markdown
### 계측 이벤트 표

| 이벤트명 | 트리거 | 파라미터 | 전송 시점 |
|---|---|---|---|
| social_login_start | 소셜 로그인 버튼 클릭 | provider, source_page | 즉시 |
| social_login_success | OAuth 콜백 성공 | provider, is_new_user, latency_ms | 즉시 |
| social_login_fail | OAuth 콜백 실패 | provider, error_code, error_msg | 즉시 |
| social_login_link | 기존 계정 연결 | provider, link_method | 즉시 |
| social_login_consent | 약관 동의 완료 | provider, consent_version | 즉시 |
```

#### A/B 테스트 계획 예시

```markdown
### A/B 테스트 계획

| 항목 | 내용 |
|---|---|
| **가설** | 소셜 로그인 추가 시 가입 전환율 15% 이상 증가 |
| **대조군** | 이메일/비밀번호 로그인만 제공 (50%) |
| **실험군** | 이메일 + Google/Apple 소셜 로그인 (50%) |
| **핵심 지표** | 가입 전환율 (회원가입 완료 / 방문자) |
| **최소 표본** | 각 그룹 5,000명 (유의수준 95%, 검정력 80%) |
| **실험 기간** | 14일 (최소) ~ 28일 (최대) |
| **성공 기준** | 전환율 15%↑ AND 7일 리텐션 하락 없음 |
| **실패/중단 기준** | 오류율 5%↑ 또는 이탈률 10%↑ |
```

#### 롤백 절차 생성

```markdown
### 롤백 절차

#### 자동 롤백 트리거
| 트리거 | 임계값 | 감지 방법 | 롤백 대상 |
|---|---|---|---|
| 5xx 오류율 | > 5% (5분간) | Datadog Alert | Feature Flag OFF |
| 로그인 성공률 | < 90% (10분간) | Custom Alert | Feature Flag OFF |
| 평균 응답 시간 | > 3초 (5분간) | APM Alert | Feature Flag OFF |

#### 수동 롤백 단계
1. Feature Flag 비활성화 (즉시 적용)
2. 영향받은 사용자 세션 처리 확인
3. 원인 분석 (로그/메트릭 리뷰)
4. 수정→재배포 또는 완전 롤백 결정
5. 사후 분석 보고서 작성
```

#### PRD 최종 검수

```
PRD 최종 검수를 수행해줘:

1. 구조 검사
   - 모든 필수 섹션이 존재하는지
   - 빈 섹션이나 TODO가 남아 있지 않은지

2. 일관성 검사
   - 용어가 문서 전체에서 통일되었는지
   - 수치/날짜가 상호 모순되지 않는지

3. 완성도 검사
   - 모든 기능에 AC가 작성되었는지
   - 예외 케이스가 누락되지 않았는지
   - 지표와 측정 방법이 명확한지

4. 형식 검사
   - 마크다운 문법 오류 없음
   - 표/목록 렌더링 정상
   - 링크가 올바른지

결과를 [통과/미흡/실패] 등급으로 각 항목별 리포트를 작성해줘.
```

#### 버전관리 + PR/릴리스 노트

```bash
# PRD 변경분을 커밋
git add docs/prd/social-login.md
git commit -m "docs(prd): 소셜 로그인 PRD v1.0 — 측정/롤백 포함"

# 릴리스 노트 초안 자동 생성
codex exec -o release-note-draft.md "docs/prd/ 디렉토리의
최근 변경을 분석하고 릴리스 노트 초안을 작성해줘.
포함 내용: 변경 요약, 주요 결정사항, 다음 단계"
```

#### 사례: "한 번에 패키징"

```
지표 정의→계측 이벤트 표→AB 계획→롤백 절차를
하나의 PRD 파일에 패키징해줘.

입력: @docs/prd/social-login-draft.md
출력: docs/prd/social-login-v1.0.md

추가로:
- 버전 히스토리 섹션 추가
- 변경 로그 (이전 버전 대비)
- PR 설명 초안을 별도 파일(pr-description.md)로 생성
```

---

### 참고 출처

- [Codex Prompting Guide](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide/)
- [Codex with Agents SDK](https://developers.openai.com/codex/guides/agents-sdk/)
- [Building Consistent Workflows — OpenAI Cookbook](https://cookbook.openai.com/examples/codex/codex_mcp_agents_sdk/building_consistent_workflows_codex_cli_agents_sdk)
- [Agent Skills](https://developers.openai.com/codex/skills/)
- [PLANS.md for Multi-Hour Solving](https://developers.openai.com/cookbook/articles/codex_exec_plans/)
- [Product-Manager-Skills (GitHub)](https://github.com/deanpeters/Product-Manager-Skills)
- [Introducing GPT-5.3-Codex](https://openai.com/index/introducing-gpt-5-3-codex/)
- [Codex Enterprise Governance](https://developers.openai.com/codex/enterprise/governance/)
