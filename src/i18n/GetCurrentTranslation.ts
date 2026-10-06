import { getLocales } from 'expo-localization';

import { resolveLanguage } from './ResolveLanguage';
import { TRANSLATIONS, type Translation } from './Translations';

// 훅을 쓸 수 없는 곳(엔진 파사드·Live Activity 컨트롤러)에서 호출 시점의 기기 언어 문구를 가져온다
export const getCurrentTranslation = (): Translation => {
  const [primaryLocale] = getLocales();

  return TRANSLATIONS[resolveLanguage(primaryLocale?.languageCode)];
};
