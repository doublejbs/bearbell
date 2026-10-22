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
    title: '방울 소리',
    labels: {
      [Sensitivity.High]: '짤랑짤랑',
      [Sensitivity.Mid]: '딸랑',
      [Sensitivity.Low]: '조용히',
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
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} · 흔들면 울려요`,
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
    title: 'Bell sound',
    labels: {
      [Sensitivity.High]: 'Jingle',
      [Sensitivity.Mid]: 'Ding',
      [Sensitivity.Low]: 'Quiet',
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
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} · Shake to ring`,
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
    title: '鈴の音',
    labels: {
      [Sensitivity.High]: 'チリンチリン',
      [Sensitivity.Mid]: 'チリン',
      [Sensitivity.Low]: '静か',
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
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} · 振ると鳴ります`,
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

const ZH_HANT: Translation = {
  status: {
    armedTitle: '搖一搖就會響',
    armedSubtitle: '走路時放進口袋或背包',
    pausedTitle: '暫停中',
    pausedSubtitle: '需要安靜時請關閉',
  },
  power: {
    turnOn: '開啟',
    turnOff: '關閉',
  },
  sensitivity: {
    title: '鈴聲',
    labels: {
      [Sensitivity.High]: '叮鈴叮鈴',
      [Sensitivity.Mid]: '叮鈴',
      [Sensitivity.Low]: '安靜',
    },
  },
  bell: {
    accessibilityLabel: '搖響鈴鐺',
  },
  notificationRationale: {
    title: '用通知顯示開啟狀態',
    message:
      '即使放在口袋裡，也能透過通知確認 bearbell 是否開啟，點一下通知就能回到 App。不允許通知，鈴鐺也照樣會響。',
    continue: '繼續',
  },
  liveActivity: {
    armedTitle: 'bearbell 已開啟',
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} · 搖一搖就會響`,
    offTitle: 'bearbell 已關閉',
    offDetail: '點一下按鈕即可重新開啟',
    staleTitle: '確認 bearbell 狀態',
    staleDetail: '請打開 App 確認是否已開啟',
    compactOff: '關閉',
    compactStale: '確認',
    stopLabel: '關閉',
    startLabel: '開啟',
  },
};

const SK: Translation = {
  status: {
    armedTitle: 'Zatras a zazvoní',
    armedSubtitle: 'Pri chôdzi ho nos vo vrecku alebo v batohu',
    pausedTitle: 'Pozastavené',
    pausedSubtitle: 'Vypni ho, keď potrebuješ ticho',
  },
  power: {
    turnOn: 'Zapnúť',
    turnOff: 'Vypnúť',
  },
  sensitivity: {
    title: 'Zvuk zvončeka',
    labels: {
      [Sensitivity.High]: 'Cinkot',
      [Sensitivity.Mid]: 'Cink',
      [Sensitivity.Low]: 'Ticho',
    },
  },
  bell: {
    accessibilityLabel: 'Zazvoniť zvončekom',
  },
  notificationRationale: {
    title: 'Uvidíš, kedy je bearbell zapnutý',
    message:
      'Upozornenie ukáže, že bearbell je zapnutý, aj keď máš telefón vo vrecku, a ťuknutím naň sa vrátiš do aplikácie. Zvonček zvoní, aj keď upozornenia nepovolíš.',
    continue: 'Pokračovať',
  },
  liveActivity: {
    armedTitle: 'bearbell zapnutý',
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} · Zatras a zazvoní`,
    offTitle: 'bearbell vypnutý',
    offDetail: 'Ťuknutím na tlačidlo ho znova zapneš',
    staleTitle: 'Skontroluj bearbell',
    staleDetail: 'Otvor aplikáciu a over, či je zapnutý',
    compactOff: 'Vypnuté',
    compactStale: 'Overiť',
    stopLabel: 'Vypnúť',
    startLabel: 'Zapnúť',
  },
};

const PL: Translation = {
  status: {
    armedTitle: 'Potrząśnij, a zadzwoni',
    armedSubtitle: 'Podczas marszu trzymaj go w kieszeni lub plecaku',
    pausedTitle: 'Wstrzymano',
    pausedSubtitle: 'Wyłącz, gdy potrzebujesz ciszy',
  },
  power: {
    turnOn: 'Włącz',
    turnOff: 'Wyłącz',
  },
  sensitivity: {
    title: 'Dźwięk dzwonka',
    labels: {
      [Sensitivity.High]: 'Głośno',
      [Sensitivity.Mid]: 'Średnio',
      [Sensitivity.Low]: 'Cicho',
    },
  },
  bell: {
    accessibilityLabel: 'Zadzwoń dzwonkiem',
  },
  notificationRationale: {
    title: 'Zobacz, kiedy bearbell jest włączony',
    message:
      'Powiadomienie pokazuje, że bearbell jest włączony, nawet gdy telefon jest w kieszeni, a dotknięcie powiadomienia przeniesie cię z powrotem do aplikacji. Dzwonek dzwoni, nawet jeśli nie zezwolisz na powiadomienia.',
    continue: 'Dalej',
  },
  liveActivity: {
    armedTitle: 'bearbell włączony',
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} · Potrząśnij, a zadzwoni`,
    offTitle: 'bearbell wyłączony',
    offDetail: 'Dotknij przycisku, aby włączyć ponownie',
    staleTitle: 'Sprawdź bearbell',
    staleDetail: 'Otwórz aplikację i sprawdź, czy jest włączony',
    compactOff: 'Wył.',
    compactStale: 'Sprawdź',
    stopLabel: 'Wyłącz',
    startLabel: 'Włącz',
  },
};

const RO: Translation = {
  status: {
    armedTitle: 'Scutură ca să sune',
    armedSubtitle: 'Ține-l în buzunar sau în rucsac când mergi',
    pausedTitle: 'În pauză',
    pausedSubtitle: 'Oprește-l când ai nevoie de liniște',
  },
  power: {
    turnOn: 'Pornește',
    turnOff: 'Oprește',
  },
  sensitivity: {
    title: 'Sunetul clopoțelului',
    labels: {
      [Sensitivity.High]: 'Tare',
      [Sensitivity.Mid]: 'Mediu',
      [Sensitivity.Low]: 'Încet',
    },
  },
  bell: {
    accessibilityLabel: 'Sună clopoțelul',
  },
  notificationRationale: {
    title: 'Vezi când bearbell este pornit',
    message:
      'O notificare îți arată că bearbell este pornit, chiar și în buzunar, iar dacă o atingi revii în aplicație. Clopoțelul sună chiar dacă nu permiți notificările.',
    continue: 'Continuă',
  },
  liveActivity: {
    armedTitle: 'bearbell pornit',
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} · Scutură ca să sune`,
    offTitle: 'bearbell oprit',
    offDetail: 'Atinge butonul ca să-l pornești din nou',
    staleTitle: 'Verifică bearbell',
    staleDetail: 'Deschide aplicația ca să confirmi că e pornit',
    compactOff: 'Oprit',
    compactStale: 'Verifică',
    stopLabel: 'Oprește',
    startLabel: 'Pornește',
  },
};

const SL: Translation = {
  status: {
    armedTitle: 'Stresi, da zazvoni',
    armedSubtitle: 'Med hojo ga imej v žepu ali nahrbtniku',
    pausedTitle: 'Zaustavljeno',
    pausedSubtitle: 'Izklopi ga, ko potrebuješ tišino',
  },
  power: {
    turnOn: 'Vklopi',
    turnOff: 'Izklopi',
  },
  sensitivity: {
    title: 'Zvok zvončka',
    labels: {
      [Sensitivity.High]: 'Cin-cin',
      [Sensitivity.Mid]: 'Cin',
      [Sensitivity.Low]: 'Tiho',
    },
  },
  bell: {
    accessibilityLabel: 'Zazvoni z zvončkom',
  },
  notificationRationale: {
    title: 'Poglej, kdaj je bearbell vklopljen',
    message:
      'Obvestilo pokaže, da je bearbell vklopljen, tudi ko je telefon v žepu, z dotikom pa se vrneš v aplikacijo. Zvonček zvoni, tudi če obvestil ne dovoliš.',
    continue: 'Nadaljuj',
  },
  liveActivity: {
    armedTitle: 'bearbell vklopljen',
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} · Stresi, da zazvoni`,
    offTitle: 'bearbell izklopljen',
    offDetail: 'Dotakni se gumba, da ga znova vklopiš',
    staleTitle: 'Preveri bearbell',
    staleDetail: 'Odpri aplikacijo in preveri, ali je vklopljen',
    compactOff: 'Izklop',
    compactStale: 'Preveri',
    stopLabel: 'Izklopi',
    startLabel: 'Vklopi',
  },
};

const HR: Translation = {
  status: {
    armedTitle: 'Protresi da zazvoni',
    armedSubtitle: 'Dok hodaš, drži ga u džepu ili ruksaku',
    pausedTitle: 'Pauzirano',
    pausedSubtitle: 'Isključi ga kad ti treba tišina',
  },
  power: {
    turnOn: 'Uključi',
    turnOff: 'Isključi',
  },
  sensitivity: {
    title: 'Zvuk zvonca',
    labels: {
      [Sensitivity.High]: 'Cin-cin',
      [Sensitivity.Mid]: 'Cin',
      [Sensitivity.Low]: 'Tiho',
    },
  },
  bell: {
    accessibilityLabel: 'Zazvoni zvoncem',
  },
  notificationRationale: {
    title: 'Vidi kad je bearbell uključen',
    message:
      'Obavijest pokazuje da je bearbell uključen, čak i u džepu, a dodirom na nju vraćaš se u aplikaciju. Zvonce zvoni i ako ne dopustiš obavijesti.',
    continue: 'Nastavi',
  },
  liveActivity: {
    armedTitle: 'bearbell uključen',
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} · Protresi da zazvoni`,
    offTitle: 'bearbell isključen',
    offDetail: 'Dodirni gumb da ga ponovno uključiš',
    staleTitle: 'Provjeri bearbell',
    staleDetail: 'Otvori aplikaciju i provjeri je li uključen',
    compactOff: 'Ugašeno',
    compactStale: 'Provjeri',
    stopLabel: 'Isključi',
    startLabel: 'Uključi',
  },
};

const IT: Translation = {
  status: {
    armedTitle: 'Scuoti per farlo suonare',
    armedSubtitle: 'Tienilo in tasca o nello zaino mentre cammini',
    pausedTitle: 'In pausa',
    pausedSubtitle: 'Spegnilo quando serve silenzio',
  },
  power: {
    turnOn: 'Accendi',
    turnOff: 'Spegni',
  },
  sensitivity: {
    title: 'Suono del campanello',
    labels: {
      [Sensitivity.High]: 'Forte',
      [Sensitivity.Mid]: 'Medio',
      [Sensitivity.Low]: 'Piano',
    },
  },
  bell: {
    accessibilityLabel: 'Suona il campanello',
  },
  notificationRationale: {
    title: 'Sai sempre quando bearbell è attivo',
    message:
      "Una notifica ti mostra che bearbell è attivo, anche in tasca, e toccandola torni subito all'app. Il campanello suona anche se non consenti le notifiche.",
    continue: 'Continua',
  },
  liveActivity: {
    armedTitle: 'bearbell attivo',
    armedDetail: (sensitivityLabel) => `${sensitivityLabel} · Scuoti per farlo suonare`,
    offTitle: 'bearbell spento',
    offDetail: 'Tocca il pulsante per riaccenderlo',
    staleTitle: 'Controlla bearbell',
    staleDetail: "Apri l'app per verificare che sia attivo",
    compactOff: 'Spento',
    compactStale: 'Verifica',
    stopLabel: 'Spegni',
    startLabel: 'Accendi',
  },
};

export const TRANSLATIONS: Record<AppLanguage, Translation> = {
  [AppLanguage.Ko]: KO,
  [AppLanguage.En]: EN,
  [AppLanguage.Ja]: JA,
  [AppLanguage.ZhHant]: ZH_HANT,
  [AppLanguage.Sk]: SK,
  [AppLanguage.Pl]: PL,
  [AppLanguage.Ro]: RO,
  [AppLanguage.Sl]: SL,
  [AppLanguage.Hr]: HR,
  [AppLanguage.It]: IT,
};
