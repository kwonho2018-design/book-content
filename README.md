# book-content — RAYUL BOOKS 콘텐츠 저장소

iPhone 앱 **RAYUL BOOKS**가 읽어 가는 콘텐츠 저장소입니다.
이 저장소의 `main` 브랜치에 push하면 GitHub Actions가 검증 후 GitHub Pages로 배포하고,
앱은 다음 실행/수동 동기화 때 새 콘텐츠를 받아갑니다. **앱 업데이트는 필요 없습니다.**

## 구조

```
book-content/
  manifest.json        ← 전체 콘텐츠 목차 + contentVersion
  categories.json      ← 카테고리 정의
  collections.json     ← 큐레이션 컬렉션
  books/<id>.json      ← 책 메타데이터 (스키마: schemas/book.schema.json)
  markdown/<id>.md     ← 책 상세 노트 (네이티브 렌더링, JS 없음)
  images/<id>-cover.jpg ← 표지 이미지 (없으면 앱이 기본 커버 표시)
  schemas/             ← JSON Schema (문서화 + 외부 검증용)
  scripts/validate.mjs ← CI 검증 스크립트
```

## 책 한 권 추가하는 법

1. `books/my-book.json` 작성 (`schemas/book.schema.json` 참고, id는 소문자-하이픈)
2. `markdown/my-book.md` 작성
3. (선택) `images/my-book-cover.jpg` 추가
4. `manifest.json`의 `books` 배열에 항목 추가, `updatedAt` 갱신
5. **`contentVersion`을 1 올리고** `lastUpdated` 갱신 ← 이걸 잊으면 앱이 변경을 감지하지 못합니다
6. main에 push → Actions 통과 시 자동 배포

## 규칙

- `contentVersion`은 콘텐츠가 바뀔 때마다 단조 증가
- `schemaVersion`은 JSON 구조 자체가 바뀔 때만 올림 (구버전 앱은 동기화를 중단하고 기존 콘텐츠 유지)
- 기존 책 수정 시 해당 책의 `updatedAt`(manifest와 book JSON 양쪽)을 갱신
- `forceRefresh: true`는 모든 클라이언트가 전체 재다운로드 — 긴급 정정 시에만 사용

## 로컬 검증

```bash
node scripts/validate.mjs
```

## GitHub Pages 설정 (최초 1회)

저장소 Settings → Pages → Source를 **GitHub Actions**로 설정하세요.
배포 주소(`https://<github-id>.github.io/book-content`)를 앱의 `AppConfig.contentBaseURL`에 넣습니다.
