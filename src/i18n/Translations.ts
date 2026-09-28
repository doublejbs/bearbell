import { Sensitivity } from '../../modules/bearbell-engine/src/Sensitivity';
import { AppLanguage } from './AppLanguage';

// 사용자에게 보이는 모든 JS 문구 — 모든 언어가 같은 키를 가지며 빈 문자열은 두지 않는다 (docs/Spec.md §10)
export type Translation = {
  status: {
    armedTitle: string;
    armedSubtitle: string;
    pausedTitle: string;
    pausedSubtitle: string;
  };
  power: {
    turnOn: string;
    turnOff: string;
  };
  sensitivity: {
    title: string;
    labels: Record<Sensitivity, string>;
  };
  bell: {
    accessibilityLabel: string;
  };
  notificationRationale: {
    title: string;
    message: string;
    continue: string;
  };
  liveActivity: {
    armedTitle: string;
    armedDetail: (sensitivityLabel: string) => string;
    offTitle: string;
    offDetail: string;
    staleTitle: string;
    staleDetail: string;
    compactOff: string;
    compactStale: string;
    stopLabel: string;
    startLabel: string;
  };
};

const KO: Translation = {
  status: {
    armedTitle: '흔들면 울려요',
    armedSubtitle: '걸을 때 주머니나 가방에 넣어두세요',
    pausedTitle: '잠시 꺼둠',
    pausedSubtitle: '조용히 해야 할 땐 꺼두세요',
  },
  power: {
    turnOn: '켜기',
    turnOff: '끄기',
  },
  sensitivity: {
    title: '흔들림 감도',
    labels: {
      [Sensitivity.High]: '예민',
      [Sensitivity.Mid]: '보통',
      [Sensitivity.Low]: '둔감',
    },
  },
  bell: {
    accessibilityLabel: '방울 울리기',
  },
  notificationRationale: {
    title: '켜짐 상태를 알림으로 보여드려요',
    message:
      '주머니 속에서도 bearbell이 켜져 있는지 알림으로 확인하고, 알림을 눌러 바로 돌아올 수 있어요. 허용하지 않아도 방울은 울려요.',
    continue: '계속',
  },
  liveActivity: {
    armedTitle: 'bearbell 켜짐',
    armedDetail: (sensitivityLabel) => `감도 ${sensitivityLabel} · 흔들면 울려요`,
    offTitle: 'bearbell 꺼짐',
    offDetail: '버튼을 눌러 다시 켤 수 있어요',
    staleTitle: 'bearbell 상태 확인 필요',
    staleDetail: '앱을 열어 켜짐 상태를 확인하세요',
    compactOff: '꺼짐',
    compactStale: '확인',
    stopLabel: '끄기',
    startLabel: '켜기',
  },
};

const EN: Translation = {
  status: {
    armedTitle: 'Shake to ring',
    armedSubtitle: 'Keep it in your pocket or bag while you walk',
    pausedTitle: 'Paused',
    pausedSubtitle: 'Turn it off when you need quiet',
  },
  power: {
    turnOn: 'Turn on',
    turnOff: 'Turn off',
  },
  sensitivity: {
    title: 'Shake sensitivity',
    labels: {
      [Sensitivity.High]: 'High',
      [Sensitivity.Mid]: 'Medium',
      [Sensitivity.Low]: 'Low',
    },
  },
  bell: {
    accessibilityLabel: 'Ring the bell',
  },
  notificationRationale: {
    title: 'See when bearbell is on',
    message:
      "A notification shows that bearbell is on, even in your pocket, and tapping it brings you back. The bell rings even if you don't allow it.",
    continue: 'Continue',
  },
  liveActivity: {
    armedTitle: 'bearbell on',
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} sensitivity · Shake to ring`,
    offTitle: 'bearbell off',
    offDetail: 'Tap the button to turn it back on',
    staleTitle: 'Check bearbell',
    staleDetail: "Open the app to confirm it's on",
    compactOff: 'Off',
    compactStale: 'Check',
    stopLabel: 'Turn off',
    startLabel: 'Turn on',
  },
};

const JA: Translation = {
  status: {
    armedTitle: '振ると鳴ります',
    armedSubtitle: '歩くときはポケットやバッグに入れてください',
    pausedTitle: '一時停止中',
    pausedSubtitle: '静かにしたいときはオフに',
  },
  power: {
    turnOn: 'オンにする',
    turnOff: 'オフにする',
  },
  sensitivity: {
    title: '揺れの感度',
    labels: {
      [Sensitivity.High]: '高',
      [Sensitivity.Mid]: '中',
      [Sensitivity.Low]: '低',
    },
  },
  bell: {
    accessibilityLabel: '鈴を鳴らす',
  },
  notificationRationale: {
    title: 'オン状態を通知でお知らせします',
    message:
      'ポケットの中でも bearbell がオンか通知で確認でき、タップするとすぐアプリに戻れます。許可しなくても鈴は鳴ります。',
    continue: '続ける',
  },
  liveActivity: {
    armedTitle: 'bearbell オン',
    armedDetail: (sensitivityLabel) => `感度 ${sensitivityLabel} · 振ると鳴ります`,
    offTitle: 'bearbell オフ',
    offDetail: 'ボタンを押すと再びオンにできます',
    staleTitle: 'bearbell の状態を確認',
    staleDetail: 'アプリを開いてオンか確認してください',
    compactOff: 'オフ',
    compactStale: '確認',
    stopLabel: 'オフ',
    startLabel: 'オン',
  },
};

export const TRANSLATIONS: Record<AppLanguage, Translation> = {
  [AppLanguage.Ko]: KO,
  [AppLanguage.En]: EN,
  [AppLanguage.Ja]: JA,
};
