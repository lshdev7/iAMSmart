# iAM Smart (백현화랑 특별행정구)

정부 공통 디지털 신분·로그인 플랫폼. 홍콩 "iAM Smart(智方便)"의 구성과 흐름을 따른다.

| 경로 | 내용 |
|---|---|
| `en/ ko/ zh-hant/ zh-hans/` | 안내 웹사이트 (`python3 tools/build.py`로 생성) |
| `app/` | 휴대폰 앱 역할을 하는 웹앱 (가입·로그인·e-ME·개인 코드·전자 증명서·설정·요청 승인) |
| `lib/ias-api.js` | 앱과 연동 사이트가 쓰는 API (`window.IAS`) |
| `lib/adapter-local.js` | 저장소: 브라우저 IndexedDB (현재 사용) |
| `lib/adapter-supabase.js` | 저장소: Supabase (나중에 사용) |
| `lib/config.js` | 어떤 저장소를 쓸지 선택 |
| `lib/ias-client.js` | 연동 사이트용: "iAM Smart로 로그인" 버튼, e-ME 자동 작성, 전자서명 요청 |
| `supabase/schema.sql` | Supabase 테이블·RLS·함수 |
| `dev/serve.py` | 세 사이트를 GitHub Pages와 같은 경로로 한 서버에서 실행 |

## 로컬 실행

```
python3 dev/serve.py          # http://127.0.0.1:8800/bhg_iAMSmart/
```

- `/BHG/`, `/bhg_Immigration_Department/`는 `../BHG_Homepage-iamsmart`, `../bhg_Immigration_Department-iamsmart`
  (로그인 연동이 들어간 로컬 전용 `iamsmart` 브랜치 작업 폴더)가 있으면 그것을, 없으면 원래 폴더를 제공한다.
- 세 사이트가 같은 출처(origin)라 로컬 저장소(IndexedDB)를 함께 쓴다. GitHub Pages(`lshdev7.github.io`)도 같은 구조다.
- localhost는 보안 컨텍스트라 카메라와 생체 인증(WebAuthn)이 동작한다. 휴대폰에서 시험하려면 HTTPS가 필요하다.

## GitHub로 옮기기

1. GitHub에 저장소 `bhg_iAMSmart`를 만든다 → `git remote add origin git@github.com:lshdev7/bhg_iAMSmart.git` → `git push -u origin main`
2. Pages를 main 브랜치 루트로 켠다. 주소: `https://lshdev7.github.io/bhg_iAMSmart/`
3. GovBHG·출입경사무처 저장소에서 `iamsmart` 브랜치를 main에 병합하고 push한다
   (`lib/ias-client.js`를 `/bhg_iAMSmart/...` 루트 상대 경로로 불러오므로 주소 변경이 필요 없다).

## Supabase로 옮기기

1. Supabase 프로젝트에서 `supabase/schema.sql`을 실행한다.
2. Authentication > Providers에서 Anonymous sign-ins를 켠다 (앱 설치 = 익명 사용자 = 기기).
3. Storage에 비공개 버킷 `ias-files`를 만든다 (신분증·얼굴 사진).
4. `lib/config.js`에서 `backend: "supabase"`, `supabase.url`, `supabase.anonKey`를 채운다.
5. `app/index.html`과 연동 사이트에서 `lib/adapter-supabase.js` 앞에 supabase-js를 불러온다:
   `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"></script>`

페이지 코드는 `window.IAS`만 부르므로 바꿀 필요가 없다. 비밀번호는 DB에서 `crypt()`(bcrypt)로만 비교하고,
`pin_hash` 열은 클라이언트에 열려 있지 않다. 연동 사이트는 요청 생성(`ias_create_request`)과 결과 조회(`ias_poll`, 비밀값 필요)만 할 수 있다.

## 데이터

- 계정: 신분증 번호, 영문·한글/한자 성명, 성별, 생년월일, 버전(basic/plus), 상태, 비밀번호 해시, 생체 인증 자격 증명 ID
- e-ME: 이메일, 전화, 호칭, 학력, 혼인 여부, 우편·거주지·청구지 주소
- 파일: 신분증 앞면, 얼굴 사진
- 요청: 로그인·e-ME·서명 요청 (유효 90초), 로그(90일 조회), 받은 편지함(메일 서버 연결 전까지 이메일 대신 사용)
