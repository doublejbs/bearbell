import { AppLanguage } from '../AppLanguage';
import { resolveLanguage } from '../ResolveLanguage';

describe('resolveLanguage', () => {
  it('한국어·일본어는 그대로 선택한다', () => {
    expect(resolveLanguage('ko')).toBe(AppLanguage.Ko);
    expect(resolveLanguage('ja')).toBe(AppLanguage.Ja);
  });

  it('영어와 지원하지 않는 언어는 영어로 떨어진다', () => {
    expect(resolveLanguage('en')).toBe(AppLanguage.En);
    expect(resolveLanguage('fr')).toBe(AppLanguage.En);
    expect(resolveLanguage('zh')).toBe(AppLanguage.En);
  });

  it('언어 정보가 없으면 영어를 쓴다', () => {
    expect(resolveLanguage(null)).toBe(AppLanguage.En);
    expect(resolveLanguage(undefined)).toBe(AppLanguage.En);
    expect(resolveLanguage('')).toBe(AppLanguage.En);
  });

  it('대소문자와 지역 태그가 섞여 들어와도 처리한다', () => {
    expect(resolveLanguage('KO')).toBe(AppLanguage.Ko);
    expect(resolveLanguage('ja-JP')).toBe(AppLanguage.Ja);
  });
});
