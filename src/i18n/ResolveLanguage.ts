import { AppLanguage } from './AppLanguage';

// 기기 언어의 기본 코드 → 앱 언어. zh 는 간체·번체 구분 없이 번체로 간다 (docs/Spec.md §10.1)
const LANGUAGE_BY_BASE_CODE = new Map<string, AppLanguage>([
  ['ko', AppLanguage.Ko],
  ['ja', AppLanguage.Ja],
  ['zh', AppLanguage.ZhHant],
  ['sk', AppLanguage.Sk],
  ['pl', AppLanguage.Pl],
  ['ro', AppLanguage.Ro],
  ['sl', AppLanguage.Sl],
  ['hr', AppLanguage.Hr],
  ['it', AppLanguage.It],
]);

// 기기 언어 코드 → 앱 언어. 지원 목록에 없는 언어는 모두 영어로 떨어진다 (docs/Spec.md §10, §10.1)
export const resolveLanguage = (languageCode: string | null | undefined): AppLanguage => {
  const baseCode = (languageCode ?? '').toLowerCase().split(/[-_]/)[0];
  const language = LANGUAGE_BY_BASE_CODE.get(baseCode);

  if (language === undefined) {
    return AppLanguage.En;
  }

  return language;
};
