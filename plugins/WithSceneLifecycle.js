// iOS 27 SDK는 UIScene 라이프사이클 미채택 앱을 실행 직후 종료시킨다.
// SDK 57 prebuild 템플릿은 AppDelegate 전용이므로, expo가 제공하는 EXExpoAppSceneDelegate를
// Info.plist에 등록하고 AppDelegate에서 window 생성·startReactNative를 제거한다. (docs/Spec.md §4.1)
const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

const SCENE_DELEGATE_CLASS_NAME = 'EXExpoAppSceneDelegate';

const PROVIDER_PROTOCOL = 'ExpoReactNativeFactoryProvider';

const CLASS_DECLARATION_PATTERN = /class AppDelegate: ExpoAppDelegate(, ExpoReactNativeFactoryProvider)? \{/;

const CONFORMING_CLASS_DECLARATION = `class AppDelegate: ExpoAppDelegate, ${PROVIDER_PROTOCOL} {`;

// didFinishLaunching 안의 window 생성 + startReactNative 블록
const START_REACT_NATIVE_BLOCK_PATTERN =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\n#endif\n/;

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: SCENE_DELEGATE_CLASS_NAME,
      },
    ],
  },
};

const fail = (message) => {
  throw new Error(`[WithSceneLifecycle] ${message}`);
};

const addProviderConformance = (contents) => {
  const match = contents.match(CLASS_DECLARATION_PATTERN);

  if (!match) {
    fail('AppDelegate.swift에서 `class AppDelegate: ExpoAppDelegate {` 선언을 찾지 못했습니다. prebuild 템플릿이 바뀌었는지 확인하세요.');
  }

  return contents.replace(CLASS_DECLARATION_PATTERN, CONFORMING_CLASS_DECLARATION);
};

const removeStartReactNativeBlock = (contents) => {
  if (START_REACT_NATIVE_BLOCK_PATTERN.test(contents)) {
    return contents.replace(START_REACT_NATIVE_BLOCK_PATTERN, '');
  }

  const isAlreadyRemoved = !contents.includes('startReactNative(') && contents.includes('reactNativeFactory = factory');

  if (isAlreadyRemoved) {
    return contents;
  }

  return fail('AppDelegate.swift에서 window 생성 + `factory.startReactNative(...)` 블록(`#if os(iOS) || os(tvOS)` ... `#endif`)을 찾지 못했습니다. prebuild 템플릿이 바뀌었는지 확인하세요.');
};

const transformAppDelegate = (contents) => {
  const withConformance = addProviderConformance(contents);

  return removeStartReactNativeBlock(withConformance);
};

const withSceneManifest = (config) => {
  return withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;

    return plistConfig;
  });
};

const withSceneAppDelegate = (config) => {
  return withAppDelegate(config, (appDelegateConfig) => {
    const { language, contents } = appDelegateConfig.modResults;

    if (language !== 'swift') {
      fail(`AppDelegate 언어가 swift가 아닙니다(${language}). Swift AppDelegate만 지원합니다.`);
    }

    appDelegateConfig.modResults.contents = transformAppDelegate(contents);

    return appDelegateConfig;
  });
};

const withSceneLifecycle = (config) => {
  const withManifest = withSceneManifest(config);

  return withSceneAppDelegate(withManifest);
};

module.exports = withSceneLifecycle;
module.exports.transformAppDelegate = transformAppDelegate;
