import { Sensitivity } from '../../../modules/bearbell-engine/src/Sensitivity';
import { AppLanguage } from '../AppLanguage';
import { TRANSLATIONS } from '../Translations';

const collectLeafPaths = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
};

const collectLeafValues = (value: unknown): unknown[] => {
  if (typeof value !== 'object' || value === null) {
    return [value];
  }

  return Object.values(value).flatMap(collectLeafValues);
};

describe('TRANSLATIONS', () => {
  const languages = Object.values(AppLanguage);

  it('세 언어가 모두 있다', () => {
    expect(Object.keys(TRANSLATIONS).sort()).toEqual([...languages].sort());
  });

  it('모든 언어가 같은 키 구조를 가진다', () => {
    const koreanPaths = collectLeafPaths(TRANSLATIONS[AppLanguage.Ko]).sort();

    languages.forEach((language) => {
      expect(collectLeafPaths(TRANSLATIONS[language]).sort()).toEqual(koreanPaths);
    });
  });

  it('빈 문자열이 없다 (함수 문구는 결과로 확인)', () => {
    languages.forEach((language) => {
      collectLeafValues(TRANSLATIONS[language]).forEach((value) => {
        if (typeof value === 'function') {
          expect(String(value('x')).trim()).not.toBe('');

          return;
        }

        expect(typeof value).toBe('string');
        expect(String(value).trim()).not.toBe('');
      });
    });
  });

  it('한국어 문구는 기존 화면 문구와 같다', () => {
    const ko = TRANSLATIONS[AppLanguage.Ko];

    expect(ko.status.armedTitle).toBe('흔들면 울려요');
    expect(ko.status.pausedTitle).toBe('잠시 꺼둠');
    expect(ko.power.turnOn).toBe('켜기');
    expect(ko.sensitivity.labels[Sensitivity.High]).toBe('예민');
    expect(ko.liveActivity.armedDetail('보통')).toBe('감도 보통 · 흔들면 울려요');
  });

  it('영어·일본어 대표 문구가 스펙과 같다', () => {
    const en = TRANSLATIONS[AppLanguage.En];
    const ja = TRANSLATIONS[AppLanguage.Ja];

    expect(en.status.armedTitle).toBe('Shake to ring');
    expect(en.sensitivity.labels[Sensitivity.Mid]).toBe('Medium');
    expect(en.liveActivity.armedDetail('Medium')).toBe('Medium sensitivity · Shake to ring');
    expect(ja.status.armedTitle).toBe('振ると鳴ります');
    expect(ja.sensitivity.labels[Sensitivity.Low]).toBe('低');
    expect(ja.liveActivity.armedDetail('中')).toBe('感度 中 · 振ると鳴ります');
  });
});
