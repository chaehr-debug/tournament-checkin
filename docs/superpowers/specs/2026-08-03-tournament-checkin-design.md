# 토너먼트 대진표 & 체크인 시스템 설계

## 개요

관리자가 다양한 형식의 싱글 엘리미네이션 토너먼트를 생성하고, 참가 팀과 대진표를 구성할 수 있는 웹앱. 팀은 로그인 없이 공개된 대진표를 보고, 본인 팀 매치를 클릭해 팀 전용 PIN을 입력하여 체크인한다. 관리자는 체크인 상태를 실시간으로 보고 경기 진행/승자 지정을 판단한다.

## 아키텍처

- **Frontend/Backend**: Next.js (App Router, TypeScript)
- **DB**: Supabase (Postgres) + Realtime 구독
- **스타일링**: Tailwind CSS
- **배포**: Vercel

## 데이터 모델

```
tournaments
  id            uuid PK
  name          text
  status        text  -- 'setup' | 'in_progress' | 'done'
  created_at    timestamptz

teams
  id             uuid PK
  tournament_id  uuid FK -> tournaments
  name           text
  pin_hash       text   -- bcrypt hash, 팀별 고유
  members        text   -- 선택 입력, 자유 텍스트

rounds
  id             uuid PK
  tournament_id  uuid FK -> tournaments
  name           text   -- 예: "8강", "4강", "결승"
  order          int    -- 진행 순서
  match_count    int

matches
  id                uuid PK
  round_id          uuid FK -> rounds
  slot              int     -- 라운드 내 위치(0-indexed)
  team_a_id         uuid FK -> teams, nullable
  team_b_id         uuid FK -> teams, nullable
  team_a_checked_in boolean default false
  team_b_checked_in boolean default false
  winner_id         uuid FK -> teams, nullable
  next_match_id     uuid FK -> matches, nullable
  next_match_slot   text    -- 'A' | 'B', nullable
```

## 관리자 플로우

1. **로그인**: 환경변수 `ADMIN_PASSWORD`와 대조. 성공 시 서명된 httpOnly 쿠키 세션 발급.
2. **토너먼트 생성**: 이름 입력 → 빈 토너먼트(`status=setup`) 생성.
3. **라운드 설계**: "라운드 추가" 버튼으로 라운드를 순서대로 추가하고 각 라운드의 경기 수 지정 (예: 8강=4경기, 4강=2경기, 결승=1경기). 추가 시 매치 슬롯이 자동 생성됨.
4. **진출 자동 연결**: 새 라운드의 경기 수가 이전 라운드의 절반이면 `next_match_id`/`next_match_slot`을 자동으로 채움(슬롯 0,1 → 다음 라운드 슬롯 0의 A/B, 슬롯 2,3 → 슬롯 1의 A/B, ...). 절반 규칙에 맞지 않으면 자동 연결을 생략하고 관리자가 각 매치 카드의 "다음 진출 경기" 드롭다운으로 수동 지정.
5. **팀 등록**: 팀 이름 + PIN(직접 입력 또는 랜덤 생성 버튼) + 참가자 명단(선택) 입력.
6. **대진 배치**: 첫 라운드 매치 카드 클릭 → 팀 목록에서 Team A / Team B 선택 배정.
7. **진행 화면**: 각 매치 카드에 양팀 체크인 상태(✅/⏳) 실시간 표시(Supabase Realtime). "승자 지정" 시 해당 팀이 `next_match_id` + `next_match_slot` 위치로 자동 배정됨.
8. **대시보드**: 지금까지 만든 토너먼트 목록(진행중/완료)을 확인하고 계속 새 토너먼트 생성 가능.

## 사용자(팀) 체크인 플로우

1. **대진표 열람**: 인증 없이 공개 URL `/t/[tournament_id]`로 접속. 라운드별 브라켓을 시각적으로 확인, 진행 중인 라운드 강조.
2. **매치 클릭**: 매치 카드 클릭 시 배정된 두 팀 이름이 보이는 모달 오픈.
3. **체크인 대상 선택**: Team A 또는 Team B 선택.
4. **PIN 입력 및 검증**: 팀 PIN 입력 → 서버에서 `team_id`가 해당 매치에 실제 배정되어 있는지 + PIN 해시 일치 여부 확인.
   - 일치: `checked_in=true` 갱신, ✅ 표시.
   - 불일치: 에러 메시지, 재입력 허용.
5. **중복 체크인 방지**: 이미 체크인된 팀은 버튼이 "체크인 완료됨"으로 비활성화.
6. **실시간 반영**: 체크인 상태 변화가 새로고침 없이 관리자 화면과 공개 대진표 양쪽에 반영(Supabase Realtime 구독).

## 보안

- 관리자 세션: 단일 비밀번호, httpOnly 서명 쿠키. 모든 관리자 API(토너먼트/라운드/팀 생성, 대진 배치, 승자 지정)는 세션 검증 필수.
- 팀 PIN: bcrypt 해시로 DB 저장. 평문 비교 없음.
- 체크인 API: `team_id + pin` 검증 시 IP+team_id 기준 5회 실패마다 30초 락아웃(무차별 대입 방지).
- 공개 대진표 열람은 인증 불필요(읽기 전용). 상태 변경(체크인)만 PIN 검증 필요.

## 범위 제외 (이번 초안 기준)

- 더블 엘리미네이션, 조별리그 등 브라켓 외 형식
- 팀/참가자 회원가입·로그인 (팀은 관리자가 등록, PIN만으로 체크인)
- 경기 점수/스코어 기록 (승자만 기록)
- 알림(푸시/문자) 발송
