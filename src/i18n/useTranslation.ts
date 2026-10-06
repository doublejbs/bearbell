import { useLocales } from 'expo-localization';

import { resolveLanguage } from './ResolveLanguage';
import { TRANSLATIONS, type Translation } from './Translations';

// 기기 언어 설정이 바뀌면 다시 렌더되도록 useLocales 를 쓴다 (docs/Spec.md §10)
const useTranslation = (): Translation => {
  const [primaryLocale] = useLocales();

  return TRANSLATIONS[resolveLanguage(primaryLocale?.languageCode)];
};

export default useTranslation;
