import { Alert, AppState, PermissionsAndroid, Platform } from 'react-native';

import NativeEngine, {
  type RunningChangeEvent,
} from '../../modules/bearbell-engine/src/BearbellEngineModule';
import { Sensitivity } from '../../modules/bearbell-engine/src/Sensitivity';
import { getCurrentTranslation } from '../i18n/GetCurrentTranslation';

const NOTIFICATION_PERMISSION_MIN_API = 33;

// 안내 + 권한 요청은 프로세스당 1회만 (docs/Spec.md §2)
let hasAskedNotificationPermission = false;

const checkNeedsNotificationPermission = () =>
  Platform.OS === 'android' && Number(Platform.Version) >= NOTIFICATION_PERMISSION_MIN_API;

// 버튼·onDismiss·백그라운드 전환 중 먼저 오는 한 번만 끝난 것으로 본다 (docs/Spec.md §2)
const showNotificationRationale = () =>
  new Promise<void>((resolve) => {
    let isResolved = false;

    const handleFinish = () => {
      if (isResolved) {
        return;
      }

      isResolved = true;
      appStateSubscription.remove();
      resolve();
    };

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        handleFinish();
      }
    });

    // 호출 시점의 기기 언어로 안내한다 (docs/Spec.md §10)
    const { notificationRationale } = getCurrentTranslation();

    Alert.alert(
      notificationRationale.title,
      notificationRationale.message,
      [{ text: notificationRationale.continue, onPress: handleFinish }],
      { cancelable: false, onDismiss: handleFinish },
    );
  });

const requestNotificationPermission = async () => {
  if (hasAskedNotificationPermission) {
    return;
  }

  // 거부되거나 확인·요청 자체가 실패해도 엔진은 시작한다 (알림만 보이지 않음)
  try {
    const isGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );

    if (isGranted) {
      return;
    }

    hasAskedNotificationPermission = true;

    await showNotificationRationale();
    await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  } catch (error) {
    console.warn('bearbell 알림 권한 요청 실패', error);
  }
};

export const startEngine = async (sensitivity: Sensitivity) => {
  if (checkNeedsNotificationPermission()) {
    await requestNotificationPermission();
  }

  await NativeEngine.start(sensitivity);
};

export const stopEngine = async () => {
  await NativeEngine.stop();
};

export const setEngineSensitivity = (sensitivity: Sensitivity) => {
  NativeEngine.setSensitivity(sensitivity);
};

export const ringBell = () => {
  NativeEngine.ringOnce();
};

// 앱 밖(Live Activity·알림 버튼)에서 켜짐 상태가 바뀌면 네이티브가 알린다 (docs/Spec.md §2.0)
export const addRunningChangeListener = (listener: (event: RunningChangeEvent) => void) =>
  NativeEngine.addListener('onRunningChange', listener);
