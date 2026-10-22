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

  it('모든 언어가 있다', () => {
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

  // 감도 라벨은 Dynamic Island compact 영역에도 보이므로 영어 'Jingle'(6자) 수준으로 짧게 둔다 (docs/Spec.md §10.1)
  it('모든 언어의 감도 라벨은 7자 이하이고 서로 다르다', () => {
    languages.forEach((language) => {
      const labels = Object.values(TRANSLATIONS[language].sensitivity.labels);

      labels.forEach((label) => {
        expect([...label].length).toBeLessThanOrEqual(7);
      });

      expect(new Set(labels).size).toBe(labels.length);
    });
  });

  it('한국어 문구는 기존 화면 문구와 같다', () => {
    const ko = TRANSLATIONS[AppLanguage.Ko];

    expect(ko.status.armedTitle).toBe('흔들면 울려요');
    expect(ko.status.pausedTitle).toBe('잠시 꺼둠');
    expect(ko.power.turnOn).toBe('켜기');
  });

  it('영어·일본어 대표 문구가 스펙과 같다', () => {
    const en = TRANSLATIONS[AppLanguage.En];
    const ja = TRANSLATIONS[AppLanguage.Ja];

    expect(en.status.armedTitle).toBe('Shake to ring');
    expect(ja.status.armedTitle).toBe('振ると鳴ります');
  });

  // 표시 이름만 '방울 소리'로 바꾸고 내부 값(high/mid/low)은 그대로 둔다 (docs/Spec.md §1.4, §10)
  describe('방울 소리 문구', () => {
    const BELL_SOUND_COPY = {
      [AppLanguage.Ko]: {
        title: '방울 소리',
        labels: {
          [Sensitivity.High]: '짤랑짤랑',
          [Sensitivity.Mid]: '딸랑',
          [Sensitivity.Low]: '조용히',
        },
        armedDetail: '딸랑 · 흔들면 울려요',
      },
      [AppLanguage.En]: {
        title: 'Bell sound',
        labels: {
          [Sensitivity.High]: 'Jingle',
          [Sensitivity.Mid]: 'Ding',
          [Sensitivity.Low]: 'Quiet',
        },
        armedDetail: 'Ding · Shake to ring',
      },
      [AppLanguage.Ja]: {
        title: '鈴の音',
        labels: {
          [Sensitivity.High]: 'チリンチリン',
          [Sensitivity.Mid]: 'チリン',
          [Sensitivity.Low]: '静か',
        },
        armedDetail: 'チリン · 振ると鳴ります',
      },
      [AppLanguage.ZhHant]: {
        title: '鈴聲',
        labels: {
          [Sensitivity.High]: '叮鈴叮鈴',
          [Sensitivity.Mid]: '叮鈴',
          [Sensitivity.Low]: '安靜',
        },
        armedDetail: '叮鈴 · 搖一搖就會響',
      },
      [AppLanguage.Sk]: {
        title: 'Zvuk zvončeka',
        labels: {
          [Sensitivity.High]: 'Cinkot',
          [Sensitivity.Mid]: 'Cink',
          [Sensitivity.Low]: 'Ticho',
        },
        armedDetail: 'Cink · Zatras a zazvoní',
      },
      [AppLanguage.Pl]: {
        title: 'Dźwięk dzwonka',
        labels: {
          [Sensitivity.High]: 'Głośno',
          [Sensitivity.Mid]: 'Średnio',
          [Sensitivity.Low]: 'Cicho',
        },
        armedDetail: 'Średnio · Potrząśnij, a zadzwoni',
      },
      [AppLanguage.Ro]: {
        title: 'Sunetul clopoțelului',
        labels: {
          [Sensitivity.High]: 'Tare',
          [Sensitivity.Mid]: 'Mediu',
          [Sensitivity.Low]: 'Încet',
        },
        armedDetail: 'Mediu · Scutură ca să sune',
      },
      [AppLanguage.Sl]: {
        title: 'Zvok zvončka',
        labels: {
          [Sensitivity.High]: 'Cin-cin',
          [Sensitivity.Mid]: 'Cin',
          [Sensitivity.Low]: 'Tiho',
        },
        armedDetail: 'Cin · Stresi, da zazvoni',
      },
      [AppLanguage.Hr]: {
        title: 'Zvuk zvonca',
        labels: {
          [Sensitivity.High]: 'Cin-cin',
          [Sensitivity.Mid]: 'Cin',
          [Sensitivity.Low]: 'Tiho',
        },
        armedDetail: 'Cin · Protresi da zazvoni',
      },
      [AppLanguage.It]: {
        title: 'Suono del campanello',
        labels: {
          [Sensitivity.High]: 'Forte',
          [Sensitivity.Mid]: 'Medio',
          [Sensitivity.Low]: 'Piano',
        },
        armedDetail: 'Medio · Scuoti per farlo suonare',
      },
    };

    it.each(Object.values(AppLanguage))('%s 섹션 제목과 세 라벨이 스펙과 같다', (language) => {
      const translation = TRANSLATIONS[language];
      const expected = BELL_SOUND_COPY[language];

      expect(translation.sensitivity.title).toBe(expected.title);
      expect(translation.sensitivity.labels).toEqual(expected.labels);
    });

    it.each(Object.values(AppLanguage))('%s Live Activity 켜짐 본문은 라벨 · 안내 문구다', (language) => {
      const translation = TRANSLATIONS[language];
      const expected = BELL_SOUND_COPY[language];

      expect(translation.liveActivity.armedDetail(expected.labels[Sensitivity.Mid])).toBe(
        expected.armedDetail,
      );
    });
  });
});
