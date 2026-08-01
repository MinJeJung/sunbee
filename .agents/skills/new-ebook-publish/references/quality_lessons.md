# quality_lessons — 복리 학습 원장

<!--
new-ebook-publish 코디네이터(리더 스레드)만 갱신한다.
- 사람 검수 결과가 나올 때마다 관찰 로그에 1줄 추가 + 상태 블록 갱신
- 같은 근본 원인 2회 반복 → 활성 규칙으로 승격
- book-launch-queue가 생성하는 모든 /book 프롬프트에 "활성 규칙" 섹션 전체를 포함시킬 것
- run이 바뀌어도 리셋하지 않는다 (배치를 넘어 누적하는 것이 복리의 핵심)
포맷 정의: SKILL.md "Quality Lessons Ledger" 섹션
-->

## 상태 블록

- concurrency_level: 1
- clean_streak: 0
- last_updated: 2026-07-15 (KST)

## 활성 규칙 (모든 새 책 프롬프트에 포함)

- [R01] 장별 원고는 서로 다른 역할·사례·판정 기준으로 분리 작성하고, 동일한 확인문구·문장틀·공식형 단락을 반복하지 않는다 — 반복 구조가 자동 게이트를 통과해도 사람 검수에서 독자 가치 부족으로 반려될 수 있음 (출처: smallbiz-shortform-ad-experiment-routine, 2026-07-05)
- [R02] 표지의 실제 노출 텍스트는 `_meta.md`의 title/subtitle/author/publisher와 정확히 대조하고, 임의 저자명·출판사명·태그라인을 넣지 않는다 — 표지 서지 불일치는 유통 전 사람 검수와 SEOJI/플랫폼 검수의 1차 반려 원인 (출처: smallbiz-shortform-ad-experiment-routine, 2026-07-05)
- [R03] 분량 보강은 반복 문단을 늘리는 작업이 아니라 독자가 새로 얻을 정보·판단 기준·실전 문안·실패 예방 포인트를 추가하는 작업으로 지시하고 검수한다 — 길이만 맞춘 증보는 독자 인사이트가 부족해 사람 검수에서 실패함 (출처: freelancer-ai-proposal-quotation-system, 2026-07-05)
- [R04] 원고 검수는 텍스트 품질뿐 아니라 EPUB 읽기 표면의 문단 리듬·표/목록 변환·색상 있는 핵심 박스·장별 실행 카드까지 확인한다 — 긴 덩어리 문단, 어색한 표, 밋밋한 화면은 내용이 좋아도 사람 검수에서 반려됨 (출처: ai-second-brain-note-rewrite, 2026-07-05)
- [R05] 집필을 시작하기 전에 장별 고유성 맵(각 장의 역할·구조 패턴·사례 도메인·시작 방식·핵심 문형)을 먼저 확정해 chapter_uniqueness_map.md로 저장하고, 각 장 writer 브리프에 자기 장의 배정만 전달한다. 장 시작 문장 틀·핵심 문장 템플릿·확인 문구를 장 간에 재사용하지 않으며, 집필 직후 장별 sequence_similarity를 자가 점검(임계 0.18)한 뒤 게이트에 넘긴다 — 자동 게이트 재작성의 지배적 원인이 장 간 구조 중복(유사도 0.66~0.94)이었음 (출처: solo-biz-ai-settlement-routine·instructor-ai-education-product-routine·freelancer-ai-proposal-quotation-system, 2026-07-05~06 연속 3권 blocked_similarity)
- [R06] 장·절 제목은 `section-장-절` 형식의 명시적 고유 앵커를 사용하고 nav.xhtml·toc.ncx의 각 목차 링크가 서로 다른 실제 앵커로 이동하는지 자동 검증한다 — 1-2 목차가 1-1로 이동한 독자 화면 오류를 재발 방지해야 함 (출처: ai-personalized-worksheet-automation, 2026-07-19)

<!-- 형식: - [R01] <하지 말 것/할 것> — <이유> (출처: <책 slug>, <날짜>) -->

## 관찰 로그 (책별 검수 기록)

- 2026-07-05 | smallbiz-shortform-ad-experiment-routine | rejected | 표지 저자명 불일치와 반복적인 원고 문장틀 때문에 리서치부터 전면 재작성 필요. 다음 제작은 장별 집필자와 장별 검수자를 분리하고, 사람 검수 전 EPUB 원문과 표지를 표 형식으로 제시해야 함 | streak 0
- 2026-07-05 | freelancer-ai-proposal-quotation-system | approved | 장별 집필 5명 + 최종 감사 구조로 전면 재작성했고, 증보분은 독자에게 새 정보·실전 문안·현장 판단 기준을 제공하는지 별도 감사해 pass. 3장 반복 밀도 압축과 5장 계약·권리·결제 문안 경계 문장 보강 후 quality_gate pass score 94 | streak 1
- 2026-07-05 | ai-second-brain-note-rewrite | rejected | 표지는 통과했으나 EPUB 원문이 기존 통과본보다 문단 리듬과 표 가독성이 떨어지고 색상/디자인 구조가 밋밋해 원고 재작업 필요. 수정본은 장별 안내 박스, 짧은 문단, 실행 카드형 표, 색상 CSS를 적용하고 기존 5사 접수본은 승인 후 교체 재승인해야 함 | streak 0
- 2026-07-05 | ai-second-brain-note-rewrite | approved | 수정 3 EPUB에서 짧은 문단 리듬, 장별 안내 박스, 실행 카드형 표 대체, 색상 CSS, 깨끗한 판권 페이지를 적용해 사용자 승인. 한 차례 사람 검수 반려 후 승인된 케이스이므로 동시성 승급용 clean streak는 유지하지 않음 | streak 0
- 2026-07-06 | instructor-ai-education-product-routine | approved | 표지 가독성 재작업, 표 형식 리스트 전환, 3장 h2 구조 보강, 5장 운영 메모 서식 추가 후 사용자 승인. 품질 게이트 pass score 94, 독자 가치 92로 유통 진행 허가 | streak 0

<!-- 형식: - YYYY-MM-DD | <책 slug> | approved/rejected | <근본 원인 또는 코멘트 증류> | streak N -->
