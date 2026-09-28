import { Platform } from 'react-native';

import { Sensitivity } from '../../modules/bearbell-engine/src/Sensitivity';
import { getCurrentTranslation } from '../i18n/GetCurrentTranslation';
import BearbellLiveActivity, {
  type BearbellLiveActivityCopy,
  type BearbellLiveActivityProps,
} from './BearbellLiveActivity';

const IMMEDIATE_DISMISSAL = 'immediate';

// 갱신이 끊기면 3분 뒤 stale 로 표시되고, 켜져 있는 동안 60초마다 갱신한다 (docs/Spec.md §2.1)
const STALE_AFTER_MS = 3 * 60 * 1000;

const HEARTBEAT_INTERVAL_MS = 60 * 1000;

// 현재 Live Activity 의 props — 감도 갱신 시 경과 타이머가 초기화되지 않도록 시작 시각을 유지하고 heartbeat 가 재전송한다
let currentProps: BearbellLiveActivityProps | null = null;

// heartbeat 가 매 틱 현재 기기 언어로 문구를 다시 만들 수 있도록 현재 감도를 함께 보관한다 (docs/Spec.md §2.1)
let currentSensitivity: Sensitivity | null = null;

let heartbeatId: ReturnType<typeof setInterval> | null = null;

// start/update/end/heartbeat 를 호출 순서대로 실행하는 단일 큐
let operationQueue: Promise<void> = Promise.resolve();

const checkIsSupported = () => Platform.OS === 'ios';

const createStaleDate = () => new Date(Date.now() + STALE_AFTER_MS);

// Live Activity 실패는 엔진 동작을 막지 않도록 경고만 남기고, 큐도 끊기지 않게 한다 (docs/Spec.md §2.1)
const enqueueOperation = (operation: () => Promise<void>, failureMessage: string) => {
  const queuedOperation = operationQueue.then(async () => {
    try {
      await operation();
    } catch (error) {
      console.warn(failureMessage, error);
    }
  });

  operationQueue = queuedOperation;

  return queuedOperation;
};

const warnRejected = (results: PromiseSettledResult<void>[], failureMessage: string) => {
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.warn(failureMessage, result.reason);
    }
  });
};

const endAllInstances = async () => {
  const instances = BearbellLiveActivity.getInstances();
  const results = await Promise.allSettled(
    instances.map((instance) => instance.end(IMMEDIATE_DISMISSAL)),
  );

  warnRejected(results, 'bearbell Live Activity 인스턴스 종료 실패');
};

// 켜짐은 staleDate 를 새로 넘기고, 꺼짐은 앱이 죽어도 사실이므로 staleDate 없이 갱신한다 (docs/Spec.md §2.1)
const updateAllInstances = async (props: BearbellLiveActivityProps) => {
  const instances = BearbellLiveActivity.getInstances();
  const staleDate = props.isArmed ? createStaleDate() : null;
  const results = await Promise.allSettled(
    instances.map((instance) =>
      staleDate === null ? instance.update(props) : instance.update(props, staleDate),
    ),
  );

  warnRejected(results, 'bearbell Live Activity 인스턴스 갱신 실패');
};

const clearHeartbeat = () => {
  if (heartbeatId !== null) {
    clearInterval(heartbeatId);
    heartbeatId = null;
  }
};

const handleHeartbeat = () => {
  enqueueOperation(async () => {
    if (currentProps === null || !currentProps.isArmed || currentSensitivity === null) {
      return;
    }

    const props: BearbellLiveActivityProps = {
      ...currentProps,
      ...createLocalizedFields(currentSensitivity),
    };

    currentProps = props;
    await updateAllInstances(props);
  }, 'bearbell Live Activity heartbeat 실패');
};

const startHeartbeat = () => {
  clearHeartbeat();
  heartbeatId = setInterval(handleHeartbeat, HEARTBEAT_INTERVAL_MS);
};

// 위젯 런타임은 번역 모듈을 못 쓰므로 호출 시점의 기기 언어로 문구를 완성해 props 로 넘긴다 (docs/Spec.md §10)
const createLocalizedFields = (
  sensitivity: Sensitivity,
): Pick<BearbellLiveActivityProps, 'copy' | 'sensitivityLabel'> => {
  const translation = getCurrentTranslation();
  const sensitivityLabel = translation.sensitivity.labels[sensitivity];
  const { liveActivity } = translation;

  const copy: BearbellLiveActivityCopy = {
    armedTitle: liveActivity.armedTitle,
    armedDetail: liveActivity.armedDetail(sensitivityLabel),
    offTitle: liveActivity.offTitle,
    offDetail: liveActivity.offDetail,
    staleTitle: liveActivity.staleTitle,
    staleDetail: liveActivity.staleDetail,
    compactOff: liveActivity.compactOff,
    compactStale: liveActivity.compactStale,
    stopLabel: liveActivity.stopLabel,
    startLabel: liveActivity.startLabel,
  };

  return { copy, sensitivityLabel };
};

const createArmedProps = (sensitivity: Sensitivity): BearbellLiveActivityProps => ({
  ...createLocalizedFields(sensitivity),
  startedAtMs: Date.now(),
  isArmed: true,
});

// 꺼짐 전환·감도 갱신용 props — 경과 타이머가 초기화되지 않도록 기존 시작 시각을 유지한다
const createUpdatedProps = (sensitivity: Sensitivity, isArmed: boolean): BearbellLiveActivityProps => ({
  ...createLocalizedFields(sensitivity),
  startedAtMs: currentProps?.startedAtMs ?? Date.now(),
  isArmed,
});

// 남은 인스턴스를 정리하고 켜짐 props 로 새로 시작한다 — 큐 안에서만 호출한다
const startFreshInstance = async (sensitivity: Sensitivity) => {
  clearHeartbeat();
  currentProps = null;
  currentSensitivity = null;
  await endAllInstances();

  const props: BearbellLiveActivityProps = createArmedProps(sensitivity);

  BearbellLiveActivity.start(props, undefined, createStaleDate());
  currentProps = props;
  currentSensitivity = sensitivity;
  startHeartbeat();
};

export const startLiveActivity = async (sensitivity: Sensitivity) => {
  if (!checkIsSupported()) {
    return;
  }

  await enqueueOperation(async () => {
    await startFreshInstance(sensitivity);
  }, 'bearbell Live Activity 시작 실패');
};

// 앱 밖(Live Activity·알림 버튼)에서 켜고 끈 결과를 반영한다 — end 하지 않고 켜짐/꺼짐 props 로 갱신 (docs/Spec.md §2.1)
export const setLiveActivityArmed = async (isArmed: boolean, sensitivity: Sensitivity) => {
  if (!checkIsSupported()) {
    return;
  }

  await enqueueOperation(async () => {
    const hasInstance = BearbellLiveActivity.getInstances().length > 0;

    if (!hasInstance && isArmed) {
      await startFreshInstance(sensitivity);

      return;
    }

    // 이미 켜진 인스턴스에 켜짐을 다시 적용하면 경과 타이머가 초기화되지 않도록 시작 시각을 유지한다 (docs/Spec.md §2.1)
    if (isArmed) {
      const isAlreadyArmed = currentProps?.isArmed === true;
      const props: BearbellLiveActivityProps = isAlreadyArmed
        ? createUpdatedProps(sensitivity, true)
        : createArmedProps(sensitivity);

      currentProps = props;
      currentSensitivity = sensitivity;
      await updateAllInstances(props);
      startHeartbeat();

      return;
    }

    clearHeartbeat();

    const props: BearbellLiveActivityProps = createUpdatedProps(sensitivity, false);

    currentProps = props;
    currentSensitivity = sensitivity;
    await updateAllInstances(props);
  }, 'bearbell Live Activity 상태 갱신 실패');
};

export const updateLiveActivity = async (sensitivity: Sensitivity) => {
  if (!checkIsSupported()) {
    return;
  }

  await enqueueOperation(async () => {
    const props: BearbellLiveActivityProps = createUpdatedProps(
      sensitivity,
      currentProps?.isArmed ?? true,
    );

    // 시작되지 않은 상태의 갱신은 heartbeat 대상 props 를 만들지 않는다
    if (currentProps !== null) {
      currentProps = props;
      currentSensitivity = sensitivity;
    }

    await updateAllInstances(props);
  }, 'bearbell Live Activity 갱신 실패');
};

export const endLiveActivities = async () => {
  if (!checkIsSupported()) {
    return;
  }

  await enqueueOperation(async () => {
    clearHeartbeat();
    currentProps = null;
    currentSensitivity = null;
    await endAllInstances();
  }, 'bearbell Live Activity 종료 실패');
};
