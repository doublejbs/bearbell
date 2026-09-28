// Android 릴리스 빌드를 업로드 키로 서명한다. (docs/Spec.md §13)
// Gradle 속성 BEARBELL_UPLOAD_* 네 개가 모두 있을 때만 signingConfigs.release를 채우고
// buildTypes.release가 그것을 쓴다. 하나라도 없으면 템플릿처럼 디버그 키로 서명한다.
// 비밀 값은 레포 밖 ~/.gradle/gradle.properties에 두며 여기에는 속성 이름만 참조한다.
const { withAppBuildGradle } = require('@expo/config-plugins');

const MARKER = '// @generated bearbell-release-signing';

const READY_VARIABLE_NAME = 'bearbellUploadKeyReady';

const PROPERTY_NAMES = [
  'BEARBELL_UPLOAD_STORE_FILE',
  'BEARBELL_UPLOAD_STORE_PASSWORD',
  'BEARBELL_UPLOAD_KEY_ALIAS',
  'BEARBELL_UPLOAD_KEY_PASSWORD',
];

// signingConfigs { debug { ... } 의 debug 블록 끝까지
const SIGNING_CONFIGS_DEBUG_PATTERN = /\n( *)signingConfigs \{\n( *)debug \{\n[^}]*?\n\2\}\n/;

// buildTypes 안 release 블록(선행 주석 허용)의 `signingConfig signingConfigs.debug` 줄
const RELEASE_SIGNING_CONFIG_PATTERN =
  /(\n *buildTypes \{\n[\s\S]*?\n *release \{\n(?: *\/\/.*\n)*)( *)signingConfig signingConfigs\.debug\n/;

const fail = (message) => {
  throw new Error(`[WithReleaseSigning] ${message}`);
};

const buildReadyDeclaration = (indent) => {
  const names = PROPERTY_NAMES.map((name) => `'${name}'`).join(', ');

  return `${indent}${MARKER}\n${indent}def ${READY_VARIABLE_NAME} = [${names}].every { project.hasProperty(it) }\n`;
};

const buildReleaseSigningConfig = (indent) => {
  const [storeFile, storePassword, keyAlias, keyPassword] = PROPERTY_NAMES;
  const inner = `${indent}    `;
  const body = `${inner}    `;

  return [
    `${inner}release {`,
    `${body}if (${READY_VARIABLE_NAME}) {`,
    `${body}    storeFile file(${storeFile})`,
    `${body}    storePassword ${storePassword}`,
    `${body}    keyAlias ${keyAlias}`,
    `${body}    keyPassword ${keyPassword}`,
    `${body}}`,
    `${inner}}`,
    '',
  ].join('\n');
};

const addReleaseSigningConfig = (contents) => {
  if (contents.includes(MARKER)) {
    return contents;
  }

  const match = contents.match(SIGNING_CONFIGS_DEBUG_PATTERN);

  if (!match) {
    fail('app/build.gradle에서 `signingConfigs { debug { ... } }` 블록을 찾지 못했습니다. prebuild 템플릿이 바뀌었는지 확인하세요.');
  }

  const [block, indent] = match;
  const replacement = `\n${buildReadyDeclaration(indent)}${block.slice(1)}${buildReleaseSigningConfig(indent)}`;

  return contents.replace(block, replacement);
};

const useReleaseSigningConfig = (contents) => {
  const conditionalLine = `signingConfig ${READY_VARIABLE_NAME} ? signingConfigs.release : signingConfigs.debug`;

  if (contents.includes(conditionalLine)) {
    return contents;
  }

  if (!RELEASE_SIGNING_CONFIG_PATTERN.test(contents)) {
    fail('app/build.gradle의 `buildTypes { release { ... } }`에서 `signingConfig signingConfigs.debug` 줄을 찾지 못했습니다. prebuild 템플릿이 바뀌었는지 확인하세요.');
  }

  return contents.replace(RELEASE_SIGNING_CONFIG_PATTERN, (_, prefix, indent) => `${prefix}${indent}${conditionalLine}\n`);
};

const transformAppBuildGradle = (contents) => {
  const withSigningConfig = addReleaseSigningConfig(contents);

  return useReleaseSigningConfig(withSigningConfig);
};

const withReleaseSigning = (config) => {
  return withAppBuildGradle(config, (gradleConfig) => {
    const { language, contents } = gradleConfig.modResults;

    if (language !== 'groovy') {
      fail(`app/build.gradle 언어가 groovy가 아닙니다(${language}). Groovy 빌드 스크립트만 지원합니다.`);
    }

    gradleConfig.modResults.contents = transformAppBuildGradle(contents);

    return gradleConfig;
  });
};

module.exports = withReleaseSigning;
module.exports.transformAppBuildGradle = transformAppBuildGradle;
