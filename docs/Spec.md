# bearbell 스펙

폰을 흔들면 곰방울(bear bell) 소리가 나는 한 화면짜리 Expo 앱. 산행 중 주머니·가방에 넣고 걸으면 방울이 울려 야생동물에게 사람의 존재를 알린다.

- Expo SDK 57 (React Native 0.86, React 19.2, TypeScript strict)
- 대상: iOS 16.4+, Android 7+ (targetSdk 36)
- 디자인 원본: `design/main-screen.dc.html`

## 1. 화면 (디자인 이식)

한 화면. 기준 프레임 390×844, 배경 `#F2EDE1`, 세로 flex, 요소 간 간격 28.

| 영역 | 내용 |
|---|---|
| 상단 | 가운데 정렬 `bearbell` — Gowun Batang 700, 30px, letterSpacing -0.5, `#1B2620` |
| 중앙 (flex 1, 가운데) | 곰 버튼(280×300) + 상태 텍스트, 간격 28 |
| 감도 | 라벨 `흔들림 감도`(13px, 500, `#6B7369`, letterSpacing 0.5) + 3칸 세그먼트 |
| 하단 | 켜기/끄기 버튼 (높이 60, radius 30, 17px 600) |

- 여백: 좌우 24, 상단 `max(64, safeTop + 16)`, 하단 `max(40, safeBottom + 16)`
- 본문 폰트: IBM Plex Sans KR (400/500/600). RN에서는 weight별로 `fontFamily`를 지정한다.

### 1.1 곰 (SVG, viewBox 0 0 280 300)

디자인의 path/circle 좌표를 그대로 옮긴다. 곰 색 `#3A352F`, 주둥이 `#8C7458`, 눈 `#050505`, 눈 하이라이트 `#E9DFC8`, 코·입 `#0A0A0A`. **켜짐/꺼짐 모두 곰 모양·색은 동일**하다.

### 1.2 음파 애니메이션

곰 양옆 4개 호(stroke `#B8862B`, width 3, round cap). 변환 기준점은 viewBox 중심(140,150). 디자인처럼 280×300 영역 밖으로 나간 부분은 잘린다.

- 켜짐: 2.4s 반복, ease-out. 0% opacity 0 / scale 0.9 → 35% opacity 0.85 → 100% opacity 0 / scale 1.18
- 켜짐 상태에서 곰 탭: 0.9s 1회 재생 후 반복 재개
- 꺼짐: 음파 opacity 0 (탭해도 음파 없음, 소리는 남)

### 1.3 상태 텍스트

| 상태 | 제목(22px 600 `#1B2620`) | 부제(15px `#6B7369`) |
|---|---|---|
| 켜짐 | 흔들면 울려요 | 걸을 때 주머니나 가방에 넣어두세요 |
| 꺼짐 | 잠시 꺼둠 | 조용히 해야 할 땐 꺼두세요 |

### 1.4 감도 세그먼트

컨테이너: 배경 `#E3DBC9`, radius 16, padding 5, 칸 간격 6, 3등분.
칸: 높이 44, radius 12, 15px. 선택 — 배경 `#1B2620` / 글자 `#F2EDE1` / 600, 미선택 — 투명 / `#4F5851` / 500.
순서: 예민(`high`) · 보통(`mid`) · 둔감(`low`). 기본값 보통. 접근성: `radiogroup` + 각 칸 `radio`, `checked` 상태.

### 1.5 켜기/끄기 버튼

- 꺼짐 → 라벨 `켜기`, 배경 `#1B2620`, 글자 `#F2EDE1`, 테두리 없음
- 켜짐 → 라벨 `끄기`, 배경 투명, 글자 `#1B2620`, 테두리 1.5 `#9AA39B`
- 접근성: `button`, `selected` = 켜짐 여부

### 1.6 앱 초기 상태

앱 실행 시 **꺼짐**(사용자가 명시적으로 켜야 백그라운드 서비스가 시작됨). 화면 마운트 시 엔진을 끄지 않는다 — 앱 밖(알림·Live Activity)에서 켠 엔진을 앱을 연다는 이유로 끄면 안 되기 때문. 대신 네이티브가 현재 상태를 복원 이벤트(§2.0 `source: restore`)로 알려 주고 UI가 그대로 따른다(켜짐/꺼짐과 감도 모두). 감도 기본값 보통.

**스플래시**: `expo-splash-screen` — 배경 `#F2EDE1`, 가운데 곰 얼굴(`assets/splash-icon.png`, 너비 200). 폰트 로드가 끝날 때까지 스플래시를 유지(`preventAutoHideAsync`)하고, 로드되면 `hideAsync`로 숨긴다(스플래시 → 빈 아이보리 화면 깜빡임 방지). 폰트 로드 전에는 배경색만 렌더.

켜기/끄기 처리 중(권한 요청·시작 대기)에는 버튼을 비활성화하고 중복 탭을 무시한다.

## 2. JS ↔ 네이티브 계약

로컬 Expo 모듈 `modules/bearbell-engine` (네이티브 모듈 이름 `BearbellEngine`). JS가 호출하는 것은 아래 4개뿐이다.

| 메서드 | 시그니처 | 동작 |
|---|---|---|
| `start` | `(sensitivity: Sensitivity) => Promise<void>` | 흔들림 감지 + 백그라운드 유지 시작. 이미 실행 중이면 감도만 갱신(멱등) |
| `stop` | `() => Promise<void>` | 감지·백그라운드 유지 중지. 실행 중이 아니어도 에러 없음 |
| `setSensitivity` | `(sensitivity: Sensitivity) => void` | 감도 저장. 실행 중이면 즉시 반영 |
| `ringOnce` | `() => void` | 엔진 실행 여부와 무관하게 종 1회 재생 |

`Sensitivity`는 string enum (`modules/bearbell-engine/src/Sensitivity.ts`): `High = 'high'`, `Mid = 'mid'`, `Low = 'low'`. 네이티브는 알 수 없는 값을 `mid`로 취급한다.

Android 13+ 에서는 `start` 호출 전 JS에서 `POST_NOTIFICATIONS` 권한을 요청한다(`PermissionsAndroid`). 거부되거나 요청 자체가 실패해도 엔진은 시작한다.

- 권한 안내: 아직 허용되지 않았으면(`PermissionsAndroid.check`) 시스템 권한 창 전에 안내 Alert를 먼저 띄운다.
  - 제목 `켜짐 상태를 알림으로 보여드려요`
  - 본문 `주머니 속에서도 bearbell이 켜져 있는지 알림으로 확인하고, 알림을 눌러 바로 돌아올 수 있어요. 허용하지 않아도 방울은 울려요.`
  - 버튼 1개 `계속` (취소 불가) → 누르면 권한 요청
- 이미 허용돼 있으면 안내·요청 없이 바로 시작
- 안내+요청은 프로세스당 1회만 (거부 후 켤 때마다 반복하지 않음)
- 안내 Alert가 버튼 없이 닫히거나(`onDismiss`), 앱이 백그라운드로 가면(`AppState`가 active가 아님) 안내를 끝난 것으로 보고 진행한다 — 어떤 경우에도 켜기 처리가 멈춰 있으면 안 됨

### 2.0 네이티브 → JS 상태 이벤트

켜기/끄기가 앱 밖(Live Activity 버튼, Android 알림 버튼)에서도 일어나므로 네이티브 모듈이 이벤트를 보낸다. JS가 호출하는 메서드는 여전히 4개뿐이다.

- 이벤트 `onRunningChange` — payload `{ isRunning: boolean; source: RunningChangeSource; sensitivity: Sensitivity }`
  - `RunningChangeSource` string enum(`modules/bearbell-engine/src/RunningChangeSource.ts`): `App = 'app'`, `LiveActivity = 'liveActivity'`, `Notification = 'notification'`, `Restore = 'restore'`
  - 복원: JS가 구독을 시작하면(`OnStartObserving`) 네이티브가 현재 상태를 `source: restore`로 1회 보낸다
  - 실제 상태가 바뀔 때만 보낸다(이미 켜진 상태에서 start → 이벤트 없음)
- JS(`useMainScreenState`)는 `source !== app` 이벤트를 받으면 `isArmed`를 그 값으로 맞추고 Live Activity를 갱신한다(아래 §2.1). 토글 처리 중(`isToggling`)이어도 이벤트 값을 우선한다
- `source: restore`는 감도도 복원한다(`sensitivity` 상태·ref 갱신, 엔진에 다시 보내지 않음)
- 앱 화면의 켜기/끄기 처리 중에 도착한 `restore`는 무시한다(복원은 상태 변화가 아닌 스냅숏이므로 토글 결과가 우선)

## 2.1 iOS Live Activity (잠금화면 · 다이나믹 아일랜드)

`expo-widgets`(SDK 57 공식)의 `createLiveActivity` 사용. iOS 16.1+ (앱 최소 16.4이므로 추가 제약 없음). Android는 기존 상시 알림 유지.

- 정의: `src/liveActivity/BearbellLiveActivity.tsx` — `'widget'` 컴포넌트, `@expo/ui/swift-ui`만 사용
  - props: `{ sensitivityLabel: string; startedAtMs: number; isArmed: boolean }`
  - 켜짐(`isArmed: true`): 아래 레이아웃 + `끄기` 버튼
  - 꺼짐(`isArmed: false`): banner·expanded `bearbell 꺼짐` / `버튼을 눌러 다시 켤 수 있어요` + `켜기` 버튼, 타이머 없음, 아이콘 회색(`#9AA39B`), compactTrailing `꺼짐`. 꺼짐 상태는 staleDate·heartbeat 없음(꺼짐은 앱이 죽어도 사실이므로)
  - 버튼: `@expo/ui` `Button` — 켜짐 화면은 `target="bearbell-stop"`, 꺼짐 화면은 `target="bearbell-start"` (방향별 타깃이라 멱등: 표시가 늦게 갱신돼 낡은 버튼을 눌러도 반대로 뒤집히지 않음). iOS 17+ 인터랙티브, 16.x는 버튼 동작 안 함
  - banner(잠금화면): 발자국 아이콘(`pawprint.fill`) + `bearbell 켜짐` + `감도 {label} · 흔들면 울려요` + 켠 뒤 경과 시간(타이머 텍스트 — `@expo/ui`가 지원하지 않으면 생략)
  - compactLeading/minimal: 발자국 아이콘, compactTrailing: 경과 시간(미지원 시 `켜짐`)
  - expanded: leading 아이콘, center `bearbell 켜짐`, bottom `감도 {label} · 흔들면 울려요`
  - 색: 앱 팔레트(잉크 `#1B2620`, 아이보리 `#F2EDE1`, 음파 `#B8862B`)
- 제어: `src/liveActivity/LiveActivityController.ts` — iOS 외 플랫폼은 no-op, 모든 실패는 `console.warn` 후 무시(엔진 동작을 절대 막지 않음)
  - `startLiveActivity(sensitivity)` — 남은 인스턴스 정리 후 새로 시작
  - `updateLiveActivity(sensitivity)` — 실행 중인 인스턴스 감도 갱신
  - `endLiveActivities()` — 모든 인스턴스 즉시 종료
- 상태 신선도(staleDate): 앱이 강제 종료·크래시되면 Live Activity가 "켜짐"으로 남아 잘못된 안심을 줄 수 있으므로
  - start/update 시 `staleDate = 지금 + 3분`을 넘기고, 켜져 있는 동안 60초마다 같은 props로 갱신(heartbeat)한다
  - 갱신이 끊겨 stale이 되면(`environment.isStale`) banner·expanded는 `bearbell 상태 확인 필요` / `앱을 열어 켜짐 상태를 확인하세요`로, 강조색 대신 회색 톤(`#9AA39B`)으로 표시하고 타이머를 숨긴다. compactTrailing은 `확인`
  - iOS Live Activity 최대 표시 시간(약 8시간) 이후 시스템이 종료하는 것은 허용(엔진은 계속 동작)
- 이미 켜짐 표시인 인스턴스에 켜짐을 다시 적용하면(복원 이벤트 등) 경과 타이머 시작 시각(`startedAtMs`)을 유지한다
- heartbeat는 매번 현재 기기 언어로 `copy`를 다시 만든다(언어 변경 반영)
- **앱 종료 시 Live Activity 정리**: 사용자가 앱을 스와이프로 종료하면 엔진(방울)도 멈추므로 Live Activity가 남아 있으면 안 된다. 백그라운드 실행 중(켜짐)인 앱은 종료 직전 `UIApplication.willTerminateNotification`을 받으므로, 네이티브 BellEngine이 이때 모든 Live Activity를 즉시 종료한다(`dismissalPolicy: .immediate`, 최대 2초 대기)
  - (2026-09-28 iPhone 15 Pro 실기기에서 동작 확인) `expo-widgets`의 `LiveActivityAttributes`는 모듈 내부 타입이라 직접 쓸 수 없다. ActivityKit은 attributes 타입의 **이름과 Codable 구조**로 활동을 식별하므로(앱·위젯 타깃이 같은 파일을 각자 컴파일해 공유하는 표준 방식과 같음), 모듈 안에 같은 이름·같은 구조(`url: String?`, `ContentState { name: String; props: String }`)의 타입을 선언해 `Activity<LiveActivityAttributes>.activities`로 조회·종료한다
  - 꺼짐 상태에서 앱이 이미 suspend된 뒤 종료되면 iOS가 `willTerminate`를 보내지 않으므로 꺼짐 Live Activity는 남을 수 있다(§11)
- 호출 직렬화: start/update/end는 컨트롤러 내부 큐로 순서대로 실행하고, 남은 인스턴스 종료 중 하나가 실패해도(`allSettled`) 다음 동작을 막지 않는다
- 연결(`useMainScreenState`): 엔진 start 성공 → start(시작 처리 중에 감도가 바뀌었으면 최신 감도를 엔진에 다시 적용하고 그 감도로 start), stop 성공 → end, 켜진 상태에서 감도 변경 → update, 복원 이벤트 → 복원된 켜짐/꺼짐으로 `setLiveActivityArmed`(마운트만으로는 end 하지 않음, §1.6)
- 감도 라벨(`예민/보통/둔감`)은 공용 상수 하나로 두고 세그먼트·Live Activity가 함께 쓴다
- 버튼 동작: `expo-widgets`의 `LiveActivityIntent`가 앱 프로세스에서 `NotificationCenter`(`onExpoWidgetsUserInteraction`, `userInfo.eventData.target`)를 post → **네이티브 BellEngine이 직접 구독**해 `bearbell-stop`이면 stop, `bearbell-start`이면 마지막 감도로 start(이미 그 상태면 무시). 이후 `onRunningChange(source: liveActivity)` 발송
  - **JS가 살아 있지 않을 때(이벤트 핸들러 미등록, 예: 앱이 완전히 종료된 뒤 버튼으로 백그라운드 실행)는 네이티브가 Live Activity 표시를 직접 갱신한다** — §2.1 "앱 종료 시 정리"와 같은 미러 `LiveActivityAttributes` 타입 사용
    - 현재 활동의 `props` JSON을 읽어 `isArmed`만 바꾸고(켜짐이면 `startedAtMs = 지금(ms)`), `copy`·`sensitivityLabel` 등 나머지는 그대로 둔다(번역 문구가 이미 들어 있음). `name`도 그대로
    - 켜짐: `staleDate = 지금 + 3분`으로 update하고, **네이티브 heartbeat**(60초마다 같은 props로 staleDate 갱신)를 시작한다. 꺼짐: staleDate 없이 update, heartbeat 중지
    - 네이티브 heartbeat는 JS 핸들러가 등록되면(앱을 열면) 즉시 멈추고, 이후는 JS가 복원 이벤트로 이어받는다. 엔진이 멈춰도 멈춘다
    - props 수정은 순수 함수(`LiveActivityPropsPatcher`)로 분리한다
    - JS가 없을 때 `bearbell-stop`은 엔진이 이미 꺼져 있어도 표시를 꺼짐으로 바꾼다(크래시 등으로 남은 낡은 켜짐 표시 정리). 엔진 자체는 꺼져 있으면 아무것도 하지 않는다
    - 네이티브 갱신은 순서대로 적용되도록 직렬 큐로 처리한다(heartbeat가 뒤늦게 켜짐을 덮어쓰지 않게)
  - 구독 보장: 앱이 종료된 상태에서 버튼으로 백그라운드 실행되면 UIScene 라이프사이클에서는 RN·모듈이 만들어지지 않으므로, `ExpoAppDelegateSubscriber`(`didFinishLaunching`)에서 `BellEngine.shared`를 초기화해 observer를 등록한다
  - 즉시 처리: 알림이 메인이 아닌 스레드에서 오면 `DispatchQueue.main.sync`로 토글을 끝낸 뒤 반환한다(intent `perform()`이 끝나기 전에 처리)
  - Live Activity에서 끈 직후 앱이 suspend되면 JS의 Live Activity 갱신이 끝나지 못할 수 있으므로, stop(source: liveActivity) 시 `beginBackgroundTask`로 5초간 실행 시간을 확보한다(타임아웃 시 종료)
- JS 동작: 이벤트를 받으면 Live Activity를 켜짐이면 켜짐 props로(heartbeat 재개), 꺼짐이면 꺼짐 props로 update(heartbeat 중지) — **end 하지 않는다**
- 앱 화면에서 끄기 → 지금처럼 Live Activity 종료(end). 앱 화면에서 켜기 → 새로 start(남은 꺼짐 인스턴스 정리 후)

## 3. 흔들림 감지 (양 플랫폼 공통 알고리즘)

- 가속도계 원시값(중력 포함)을 **g 단위**로 50Hz 샘플링 (Android는 m/s² ÷ 9.80665)
- `deviation = |sqrt(x²+y²+z²) − 1.0|`
- 감도별 임계값: 예민 `0.55g`, 보통 `0.90g`, 둔감 `1.40g` (실기기 테스트 결과 기존 둔감 0.90g가 보통에 적합해 한 단계씩 이동)
- `deviation ≥ threshold` 이고 직전 울림 이후 `300ms` 이상 지났으면 울림
- 볼륨: `clamp(0.55 + 0.45 × (deviation − threshold) / threshold, 0.55, 1.0)` — 세게 흔들수록 크게

## 4. 네이티브 구현

### 4.1 iOS (Swift)

- **CoreMotion** `CMMotionManager.startAccelerometerUpdates` (interval 1/50, 전용 `OperationQueue`)
- **AVAudioSession** category `.playback`, options `.mixWithOthers` (무음 스위치와 무관하게 울림, 다른 앱 음악과 공존)
- 백그라운드 유지: `UIBackgroundModes: [audio]` + 엔진 실행 중 무음 WAV(`silence.wav`)를 `AVAudioPlayer`로 무한 반복 재생 → 앱이 백그라운드·화면 꺼짐에서도 살아 있고 CoreMotion 콜백이 계속 들어옴
- 종소리: `bell.wav`를 `AVAudioPlayer` 4개 풀에서 라운드로빈 재생(겹쳐 울림 허용)
- 오디오 인터럽션(전화 등) 종료 시 실행 중이면 세션 재활성화 + 무음 루프 재개, media services reset 시 플레이어 재생성
- `.ended` 알림이 오지 않는 경우에 대비해, 울림 직전 세션이 비활성이면 재활성화 + 무음 루프 재개를 시도하고, 앱이 active가 될 때(`didBecomeActive`)도 동일하게 복구
- 엔진이 꺼진 상태에서 `ringOnce`로 활성화한 세션은 종소리 재생이 끝나면 비활성화
- 리소스: podspec `resource_bundles` (`BearbellEngineAssets`)
- `NSMotionUsageDescription` 문구 포함
- **UIScene 라이프사이클 채택 (iOS 27 SDK 필수)**: Xcode 27로 빌드하면 scene 미채택 앱은 실행 직후 UIKit이 SIGTRAP으로 종료시킨다(`_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`). SDK 57 prebuild 템플릿은 아직 AppDelegate 전용이므로 로컬 config plugin `plugins/WithSceneLifecycle.js`로 처리한다.
  - Info.plist `UIApplicationSceneManifest` — 단일 scene, `UISceneDelegateClassName = EXExpoAppSceneDelegate` (expo 패키지 제공)
  - AppDelegate가 `ExpoReactNativeFactoryProvider`를 채택하고, `didFinishLaunching`에서는 factory만 만들고 window 생성·`startReactNative`는 scene delegate에 맡긴다

### 4.1.1 Android 알림 버튼

- 켜짐 알림(포그라운드 서비스)에 `끄기` 액션 → 서비스가 자신을 중지하고, **꺼짐 알림**(일반 알림, 같은 채널, 스와이프로 지울 수 있음) `bearbell 꺼짐` / `켜기를 누르면 다시 흔들림을 감지해요` + `켜기` 액션을 남긴다
- `켜기` 액션 → `PendingIntent.getForegroundService`로 서비스 시작(알림 상호작용은 백그라운드 FGS 시작 예외), 마지막 감도 사용, 꺼짐 알림 제거
- 앱 화면에서 끄기 → 꺼짐 알림 없이 모두 제거(지금과 동일)
- 기기·앱 언어가 바뀌면(`onConfigurationChanged`) 채널 이름을 다시 등록하고, 켜짐이면 켜짐 알림을 새 언어로 다시 게시한다
- 상태 변화 시 모듈이 `onRunningChange` 발송(source: 알림 버튼이면 `notification`, 앱 호출이면 `app`). 서비스↔모듈은 프로세스 전역 리스너로 연결
- PendingIntent는 `FLAG_IMMUTABLE`, 액션별 requestCode 분리

### 4.2 Android (Kotlin)

- **Foreground service** `BearbellService`, `foregroundServiceType="mediaPlayback"` (종소리 재생이 서비스의 본질 기능)
  - 권한: `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `POST_NOTIFICATIONS`, `WAKE_LOCK`
  - 모듈 `AndroidManifest.xml`에 선언 → Gradle manifest merge (CNG 원칙상 `android/` 직접 수정 금지)
  - 알림 채널 `bearbell_engine` (IMPORTANCE_LOW), 상시 알림 "bearbell 켜짐 / 흔들면 방울이 울려요", 탭 시 앱 실행
  - `PARTIAL_WAKE_LOCK`으로 화면 꺼짐 중에도 센서 이벤트 수신
  - `START_NOT_STICKY` — 프로세스가 죽으면 사용자가 다시 켤 때까지 재시작하지 않음(§1.6)
  - 중지는 `ACTION_STOP` 인텐트로 서비스에 전달 → 서비스가 `startForeground` 이후 `stopSelf` (startForegroundService 직후 stopService 시 크래시 방지). `startForeground`가 거부되면 로그 후 종료
- **SensorManager** `TYPE_ACCELEROMETER`, `SENSOR_DELAY_GAME`
- **SoundPool** (maxStreams 4, `USAGE_MEDIA` / `CONTENT_TYPE_SONIFICATION`), `res/raw/bearbell_bell.wav`. 로드 완료 전 재생 요청은 로드 후 1회 재생
- 감도는 프로세스 전역 `@Volatile` 상태로 공유 (모듈 ↔ 서비스)

## 5. 종소리 합성

저작권 문제가 없도록 코드로 직접 합성한다 (`scripts/BellSynth.ts`, 생성기 `scripts/GenerateBellSounds.mjs`).

- 44.1kHz, 16bit PCM, mono WAV, 길이 1.6s
- 놋쇠 곰방울: 비조화 배음 합(비율 1.0/2.76/5.40/8.93 + 1.003 디튠 맥놀이), 기본음 2100Hz, 배음별 지수 감쇠
- 타격음: 4ms 노이즈 버스트
- 방울 속 추(clapper)가 되튀는 소리: 60ms·140ms 지점에 약한 재타격
- 결정적 PRNG(시드 고정) → 재생성해도 동일 파일
- 피크 0.89로 정규화, 1.5ms 어택 램프, 끝 50ms 페이드아웃
- 산출물: `modules/bearbell-engine/ios/Assets/bell.wav`, `.../ios/Assets/silence.wav`(1s 무음), `modules/bearbell-engine/android/src/main/res/raw/bearbell_bell.wav`

## 6. 파일 구조

```
AppEntry.ts                         # registerRootComponent (package.json main)
src/App.tsx                         # 폰트 로드, SafeAreaProvider, MainScreen
src/theme/Colors.ts, Fonts.ts
src/engine/BearbellEngine.ts        # 네이티브 모듈 파사드 (권한 요청 포함)
src/screens/main/
  MainScreen.tsx                    # 조립
  useMainScreenState.ts             # 상태·핸들러
  BearBellView.tsx                  # 곰 SVG + 음파 애니메이션
  StatusTextView.tsx
  SensitivitySelectorView.tsx
  PowerButtonView.tsx
modules/bearbell-engine/
  expo-module.config.json
  src/BearbellEngineModule.ts, BearbellEngineModule.web.ts, Sensitivity.ts
  ios/BearbellEngine.podspec, BearbellEngineModule.swift, BellEngine.swift, ShakeDetector.swift, Assets/
  android/build.gradle, src/main/AndroidManifest.xml, src/main/res/, src/main/java/expo/modules/bearbellengine/*.kt
scripts/BellSynth.ts, scripts/GenerateBellSounds.mjs
```

## 7. 비범위

- 켜짐 상태 영속화, Android 16 Live Updates, 웹 지원(웹은 no-op 스텁)
- 네이티브 실행 상태 조회 API(`isRunning`) — JS 호출은 4개로 제한하므로 §2.0 이벤트(복원 포함)로 대신한다
- Expo Router: 화면이 하나뿐이라 도입하지 않음

## 8. 검증

`npx tsc --noEmit`, `npx expo lint`, `npx jest`, `npx expo-doctor`, `npx expo prebuild --clean --no-install` 후 생성된 Info.plist/AndroidManifest 확인.

## 9. 배포 심사 리스크

- iOS: 무음 오디오 루프로 백그라운드를 유지하므로 App Review 2.5.4 관련 질의 가능 — "백그라운드에서 흔들림에 반응해 실제로 종소리를 내는 것이 핵심 기능"임을 심사 노트에 기재
- Android: `mediaPlayback` FGS 타입 선언 심사 — 종소리 재생이 서비스의 본질 기능임을 소명, 반려 시 `specialUse`로 전환 검토

## 10. 다국어 (한국어 · 영어 · 일본어)

글로벌 출시(유료 ₩1,100 — 가격은 스토어 콘솔에서 설정, 코드 변경 없음)를 위해 사용자에게 보이는 모든 문구를 3개 언어로 제공한다.

- 언어 결정: `expo-localization`의 기기 언어(`languageCode`) — `ko` → 한국어, `ja` → 일본어, 그 외 → **영어(기본)**. 설정 변경 시 다시 렌더(`useLocales`)
- 앱 이름: 모든 언어에서 `bearbell` 그대로(브랜드)
- 범위
  - JS 화면: 상태 문구, 감도 라벨·섹션 제목, 켜기/끄기, 곰 버튼 접근성 라벨, Android 알림 권한 안내 Alert
  - Live Activity: 위젯 런타임은 모듈 스코프를 못 쓰므로 **번역된 문구를 props로 전달**(`copy` 객체). 컨트롤러가 호출 시점의 기기 언어로 문구를 만든다
  - Android 네이티브 알림: 채널 이름, 켜짐/꺼짐 알림 제목·본문, 끄기/켜기 액션 → `res/values`(영어 기본), `values-ko`, `values-ja` 문자열 리소스
  - iOS Info.plist `NSMotionUsageDescription`: 기본 영어, `app.json` `locales`(ko/ja)로 번역, `CFBundleAllowMixedLocalizations: true`
  - `expo-localization` 플러그인 `supportedLocales`: ios/android 모두 `["en", "ko", "ja"]` (시스템 설정의 앱별 언어 지원)
- 구조
  - `src/i18n/AppLanguage.ts` — string enum `Ko = 'ko'`, `En = 'en'`, `Ja = 'ja'`
  - `src/i18n/ResolveLanguage.ts` — `resolveLanguage(languageCode: string | null | undefined): AppLanguage`
  - `src/i18n/Translations.ts` — `TRANSLATIONS: Record<AppLanguage, Translation>` (모든 언어가 같은 키, 빈 문자열 금지). 감도 라벨 포함(`SENSITIVITY_LABELS` 대체)
  - `src/i18n/useTranslation.ts` — 현재 언어의 `Translation` 반환(`useLocales` 기반)
  - `src/i18n/GetCurrentTranslation.ts` — 훅 밖(엔진 파사드·Live Activity 컨트롤러)에서 쓰는 `getCurrentTranslation()` (`getLocales()` 기반)
- 영어·일본어 문구 (한국어는 §1~§4 그대로)

| 키 | English | 日本語 |
|---|---|---|
| 켜짐 제목/부제 | Shake to ring / Keep it in your pocket or bag while you walk | 振ると鳴ります / 歩くときはポケットやバッグに入れてください |
| 꺼짐 제목/부제 | Paused / Turn it off when you need quiet | 一時停止中 / 静かにしたいときはオフに |
| 감도 제목 | Shake sensitivity | 揺れの感度 |
| 예민/보통/둔감 | High / Medium / Low | 高 / 中 / 低 |
| 켜기/끄기 | Turn on / Turn off | オンにする / オフにする |
| 곰 버튼 접근성 | Ring the bell | 鈴を鳴らす |
| 권한 안내 제목 | See when bearbell is on | オン状態を通知でお知らせします |
| 권한 안내 본문 | A notification shows that bearbell is on, even in your pocket, and tapping it brings you back. The bell rings even if you don't allow it. | ポケットの中でも bearbell がオンか通知で確認でき、タップするとすぐアプリに戻れます。許可しなくても鈴は鳴ります。 |
| 권한 안내 버튼 | Continue | 続ける |
| LA 켜짐 제목 / 본문 | bearbell on / {label} sensitivity · Shake to ring | bearbell オン / 感度 {label} · 振ると鳴ります |
| LA 꺼짐 제목 / 본문 | bearbell off / Tap the button to turn it back on | bearbell オフ / ボタンを押すと再びオンにできます |
| LA 확인 필요 제목 / 본문 | Check bearbell / Open the app to confirm it's on | bearbell の状態を確認 / アプリを開いてオンか確認してください |
| LA compact 꺼짐 / 확인 | Off / Check | オフ / 確認 |
| LA 버튼 끄기/켜기 | Turn off / Turn on | オフ / オン |
| 알림 채널 | bearbell status | bearbell の状態 |
| 켜짐 알림 | bearbell on / Shake to ring the bell | bearbell オン / 振ると鈴が鳴ります |
| 꺼짐 알림 | bearbell off / Tap Turn on to detect shaking again | bearbell オフ / 「オン」を押すと再び揺れを検知します |
| 알림 액션 끄기/켜기 | Turn off / Turn on | オフ / オン |
| NSMotionUsageDescription | bearbell uses motion sensors to ring the bell when it detects shaking in your pocket. | ポケットの中の揺れを検知して鈴を鳴らすため、モーションセンサーを使用します。 |

- 일본어·영어 문구는 출시 전 원어민 검수를 권장

## 11. 알려진 제한

- iOS: 꺼 둔 뒤 오래 지나 앱이 완전히 잠든(suspend) 상태에서 종료되면 종료 알림이 오지 않아 꺼짐 Live Activity가 남을 수 있다. 켜짐 상태나 끈 직후 종료하면 사라진다(2026-09-28 실기기 확인)
- iOS: JS 리로드·앱 재실행 후 복원되면 Live Activity 경과 타이머가 0부터 다시 시작한다(시작 시각은 JS 메모리에만 있음)
- Android: 알림으로 끈 뒤 남은 꺼짐 알림은 이후 언어가 바뀌어도 이전 언어로 남는다(서비스가 이미 종료됨). 켜짐 알림은 언어 변경을 반영한다

## 12. 감도 저장

- 마지막 감도를 기기에 저장한다 — iOS `UserDefaults`(키 `bearbell.sensitivity`), Android `SharedPreferences`(파일 `bearbell_engine`, 키 `sensitivity`)
- `start`/`setSensitivity`로 바뀔 때마다 저장하고, 엔진 초기화 시 불러온다(없거나 알 수 없는 값이면 보통)
- 그래서 프로세스가 죽은 뒤 알림·Live Activity로 켜도 마지막 감도로 동작하고, 앱을 열면 복원 이벤트(§2.0)로 화면에도 그 감도가 표시된다

## 13. 출시 빌드

- 버전: `version` 1.0.0, iOS `buildNumber` "2", Android `versionCode` 1 (`app.json`)
- iOS는 **iPhone 전용**(`supportsTablet: false`) — 주머니에 넣고 걷는 앱이라 iPad 지원 실익이 없고, iPad 스크린샷 요구를 피한다
- iOS 수출 규정: 표준 암호화만 사용 → `ITSAppUsesNonExemptEncryption: false` (업로드마다 수출 규정 질문을 건너뜀)
- Android 릴리스 서명: 로컬 config plugin `plugins/WithReleaseSigning.js`
  - Gradle 속성 `BEARBELL_UPLOAD_STORE_FILE`, `BEARBELL_UPLOAD_STORE_PASSWORD`, `BEARBELL_UPLOAD_KEY_ALIAS`, `BEARBELL_UPLOAD_KEY_PASSWORD`가 **모두 있으면** `signingConfigs.release`를 만들고 `buildTypes.release`가 그것을 쓰게 한다. 하나라도 없으면 템플릿 그대로(디버그 키) 둔다 — 키가 없는 머신에서도 빌드는 된다
  - 값은 레포 밖 `~/.gradle/gradle.properties`에 둔다(키스토어 파일은 `~/.android-keystores/`). 레포에는 비밀 값이 들어가지 않는다
  - Play 앱 서명(Play App Signing)을 쓰므로 이 키는 업로드 키다
  - 변환은 순수 함수 `transformAppBuildGradle(contents)`로 export하고, 여러 번 적용해도 같은 결과(멱등), 템플릿 구조가 다르면 명확한 에러
- 스토어 자산: iOS 6.9" 스크린샷, Android 휴대전화 스크린샷(가로:세로 ≤ 1:2), Play 그래픽 이미지 1024×500 — 한·영·일
