#!/usr/bin/env node
/**
 * book-content 검증 스크립트 (의존성 없음, Node 18+)
 *
 * 검사 항목:
 * 1. manifest.json / books/*.json / collections.json / categories.json 파싱 및 필수 필드
 * 2. 모든 book JSON이 manifest에 등록되어 있는지 (역방향 포함)
 * 3. manifest가 가리키는 파일(jsonPath, markdownPath)이 실제로 존재하는지
 * 4. 이미지 경로(coverPath, coverImage)가 형식에 맞는지 + 존재 여부(경고)
 * 5. relatedBookIds, collections.bookIds 가 실제 책을 가리키는지
 *
 * 실패하면 exit code 1 → GitHub Actions가 배포를 중단한다.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

function readJSON(path) {
  try {
    return JSON.parse(readFileSync(join(root, path), "utf8"));
  } catch (e) {
    errors.push(`${path}: JSON 파싱 실패 — ${e.message}`);
    return null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;
const ID_PATTERN = /^[a-z0-9-]+$/;
const IMAGE_PATTERN = /^images\/.+\.(jpg|jpeg|png|webp)$/;
const DIFFICULTIES = ["beginner", "intermediate", "advanced"];

// 1. manifest
const manifest = readJSON("manifest.json");
if (!manifest) fail();

for (const field of ["schemaVersion", "contentVersion", "lastUpdated", "books"]) {
  if (manifest[field] === undefined) errors.push(`manifest.json: 필수 필드 누락 — ${field}`);
}
if (manifest.lastUpdated && !ISO_DATE.test(manifest.lastUpdated)) {
  errors.push(`manifest.json: lastUpdated 형식 오류 — ${manifest.lastUpdated}`);
}

const manifestIds = new Set();
for (const entry of manifest.books ?? []) {
  const where = `manifest.books[${entry.id ?? "?"}]`;
  for (const field of ["id", "title", "author", "updatedAt", "jsonPath"]) {
    if (!entry[field]) errors.push(`${where}: 필수 필드 누락 — ${field}`);
  }
  if (entry.id && !ID_PATTERN.test(entry.id)) errors.push(`${where}: id 형식 오류`);
  if (entry.updatedAt && !ISO_DATE.test(entry.updatedAt)) errors.push(`${where}: updatedAt 형식 오류`);
  if (entry.id) manifestIds.add(entry.id);

  // 3. 파일 존재 확인
  if (entry.jsonPath && !existsSync(join(root, entry.jsonPath))) {
    errors.push(`${where}: jsonPath 파일 없음 — ${entry.jsonPath}`);
  }
  if (entry.markdownPath && !existsSync(join(root, entry.markdownPath))) {
    errors.push(`${where}: markdownPath 파일 없음 — ${entry.markdownPath}`);
  }
  // 4. 이미지: 형식은 에러, 부재는 경고 (기본 커버로 대체 가능)
  if (entry.coverPath) {
    if (!IMAGE_PATTERN.test(entry.coverPath)) errors.push(`${where}: coverPath 형식 오류 — ${entry.coverPath}`);
    else if (!existsSync(join(root, entry.coverPath))) warnings.push(`${where}: 표지 이미지 없음 — ${entry.coverPath} (앱은 기본 커버 표시)`);
  }
}

// 2. books/*.json ↔ manifest 양방향 확인 + 필드 검증
const bookFiles = existsSync(join(root, "books"))
  ? readdirSync(join(root, "books")).filter((f) => f.endsWith(".json"))
  : [];
const bookIds = new Set();

for (const file of bookFiles) {
  const book = readJSON(`books/${file}`);
  if (!book) continue;
  const where = `books/${file}`;

  for (const field of ["id", "title", "author", "category", "tags", "difficulty", "oneLine", "whyRead", "summary", "keyQuotes"]) {
    if (book[field] === undefined) errors.push(`${where}: 필수 필드 누락 — ${field}`);
  }
  if (book.difficulty && !DIFFICULTIES.includes(book.difficulty)) {
    errors.push(`${where}: difficulty 값 오류 — ${book.difficulty}`);
  }
  if (book.curatorScore !== undefined && (book.curatorScore < 0 || book.curatorScore > 100)) {
    errors.push(`${where}: curatorScore 범위 오류 — ${book.curatorScore}`);
  }
  if (book.coverImage && !IMAGE_PATTERN.test(book.coverImage)) {
    errors.push(`${where}: coverImage 형식 오류 — ${book.coverImage}`);
  }
  if (book.id) {
    bookIds.add(book.id);
    if (!manifestIds.has(book.id)) errors.push(`${where}: manifest.json에 등록되지 않은 책 — ${book.id}`);
    if (file !== `${book.id}.json`) warnings.push(`${where}: 파일명과 id 불일치 — ${book.id}`);
  }
}

for (const id of manifestIds) {
  if (!bookIds.has(id)) errors.push(`manifest.json: 책 파일이 없는 항목 — ${id}`);
}

// 5. 참조 무결성
for (const file of bookFiles) {
  const book = readJSON(`books/${file}`);
  if (!book) continue;
  for (const related of book.relatedBookIds ?? []) {
    if (!bookIds.has(related)) {
      warnings.push(`books/${file}: relatedBookIds에 존재하지 않는 책 — ${related} (앱은 무시함)`);
    }
  }
}

const collections = readJSON("collections.json");
for (const collection of collections?.collections ?? []) {
  for (const id of collection.bookIds ?? []) {
    if (!bookIds.has(id)) errors.push(`collections.json[${collection.id}]: 존재하지 않는 책 — ${id}`);
  }
}

const categories = readJSON("categories.json");
const categoryIds = new Set((categories?.categories ?? []).map((c) => c.id));
for (const file of bookFiles) {
  const book = readJSON(`books/${file}`);
  if (book?.category && !categoryIds.has(book.category)) {
    warnings.push(`books/${file}: categories.json에 없는 카테고리 — ${book.category}`);
  }
}

// 결과 출력
for (const w of warnings) console.log(`⚠️  ${w}`);
fail();

function fail() {
  if (errors.length > 0) {
    for (const e of errors) console.error(`❌ ${e}`);
    console.error(`\n검증 실패: 오류 ${errors.length}건`);
    process.exit(1);
  }
  console.log(`✅ 검증 통과 (경고 ${warnings.length}건)`);
  process.exit(0);
}
