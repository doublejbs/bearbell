import { AppLanguage } from './AppLanguage';

// 기기 언어 코드 → 앱 언어. ko·ja 외에는 모두 영어로 떨어진다 (docs/Spec.md §10)
export const resolveLanguage = (languageCode: string | null | undefined): AppLanguage => {
  const baseCode = (languageCode ?? '').toLowerCase().split('-')[0];

  if (baseCode === AppLanguage.Ko) {
    return AppLanguage.Ko;
  }

  if (baseCode === AppLanguage.Ja) {
    return AppLanguage.Ja;
  }

  return AppLanguage.En;
};
