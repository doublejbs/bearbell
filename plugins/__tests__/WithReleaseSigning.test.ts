import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { transformAppBuildGradle } = require('../WithReleaseSigning');

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'fixtures', 'AppBuildGradle.template'), 'utf8');

const PROPERTY_NAMES = [
  'BEARBELL_UPLOAD_STORE_FILE',
  'BEARBELL_UPLOAD_STORE_PASSWORD',
  'BEARBELL_UPLOAD_KEY_ALIAS',
  'BEARBELL_UPLOAD_KEY_PASSWORD',
];

const extractBlock = (contents: string, header: string) => {
  const start = contents.indexOf(header);

  expect(start).toBeGreaterThanOrEqual(0);

  let depth = 0;

  for (let i = contents.indexOf('{', start); i < contents.length; i++) {
    if (contents[i] === '{') {
      depth += 1;
    }

    if (contents[i] === '}') {
      depth -= 1;

      if (depth === 0) {
        return contents.slice(start, i + 1);
      }
    }
  }

  throw new Error(`unterminated block: ${header}`);
};

describe('transformAppBuildGradle', () => {
  it('signingConfigs 에 업로드 키 속성을 읽는 release 설정을 추가한다', () => {
    const result = transformAppBuildGradle(TEMPLATE);
    const signingConfigs = extractBlock(result, 'signingConfigs {');

    expect(signingConfigs).toContain('release {');
    PROPERTY_NAMES.forEach((name) => {
      expect(signingConfigs).toContain(name);
    });
    expect(signingConfigs).toContain("storeFile file('debug.keystore')");
  });

  it('네 속성이 모두 있을 때만 release 빌드가 업로드 키를 쓰고, 아니면 디버그 키를 쓴다', () => {
    const result = transformAppBuildGradle(TEMPLATE);
    const buildTypes = extractBlock(result, 'buildTypes {');
    const release = extractBlock(buildTypes, 'release {');

    expect(release).toContain('signingConfigs.release');
    expect(release).toContain('signingConfigs.debug');
    expect(release).not.toMatch(/^\s*signingConfig signingConfigs\.debug\s*$/m);
    PROPERTY_NAMES.forEach((name) => {
      expect(result).toContain(name);
    });
  });

  it('debug 빌드 타입은 그대로 디버그 키를 쓴다', () => {
    const result = transformAppBuildGradle(TEMPLATE);
    const buildTypes = extractBlock(result, 'buildTypes {');
    const debug = extractBlock(buildTypes, 'debug {');

    expect(debug).toMatch(/signingConfig signingConfigs\.debug/);
  });

  it('레포에 비밀 값을 넣지 않는다 — 속성 이름만 참조한다', () => {
    const result = transformAppBuildGradle(TEMPLATE);
    const added = result.replace(TEMPLATE, '');

    expect(result).not.toMatch(/storePassword\s+'(?!android')[^']+'/);
    expect(added).not.toMatch(/\.jks['"]/);
  });

  it('여러 번 적용해도 결과가 같다 (멱등)', () => {
    const once = transformAppBuildGradle(TEMPLATE);

    expect(transformAppBuildGradle(once)).toBe(once);
  });

  it('템플릿 구조가 다르면 명확한 에러를 던진다', () => {
    expect(() => transformAppBuildGradle('android {\n}\n')).toThrow(/WithReleaseSigning/);
    expect(() =>
      transformAppBuildGradle(TEMPLATE.replace('signingConfig signingConfigs.debug\n            def enableShrink', 'def enableShrink')),
    ).toThrow(/WithReleaseSigning/);
  });
});
