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
    expect(resolveLanguage('de')).toBe(AppLanguage.En);
    expect(resolveLanguage('constructor')).toBe(AppLanguage.En);
    expect(resolveLanguage('__proto__')).toBe(AppLanguage.En);
    expect(resolveLanguage('toString')).toBe(AppLanguage.En);
  });

  it('중국어는 간체·번체·지역 구분 없이 번체로 선택한다', () => {
    expect(resolveLanguage('zh')).toBe(AppLanguage.ZhHant);
    expect(resolveLanguage('zh-Hant-TW')).toBe(AppLanguage.ZhHant);
    expect(resolveLanguage('zh-Hans-CN')).toBe(AppLanguage.ZhHant);
    expect(resolveLanguage('ZH')).toBe(AppLanguage.ZhHant);
    expect(resolveLanguage('zh_TW')).toBe(AppLanguage.ZhHant);
  });

  it('곰 방울 사용 국가 언어를 그대로 선택한다', () => {
    expect(resolveLanguage('sk')).toBe(AppLanguage.Sk);
    expect(resolveLanguage('pl')).toBe(AppLanguage.Pl);
    expect(resolveLanguage('ro')).toBe(AppLanguage.Ro);
    expect(resolveLanguage('sl')).toBe(AppLanguage.Sl);
    expect(resolveLanguage('hr')).toBe(AppLanguage.Hr);
    expect(resolveLanguage('it')).toBe(AppLanguage.It);
    expect(resolveLanguage('it-IT')).toBe(AppLanguage.It);
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
