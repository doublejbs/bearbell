import { useCallback, useEffect, useRef, useState } from 'react';

import { type RunningChangeEvent } from '../../../modules/bearbell-engine/src/BearbellEngineModule';
import { RunningChangeSource } from '../../../modules/bearbell-engine/src/RunningChangeSource';
import { Sensitivity } from '../../../modules/bearbell-engine/src/Sensitivity';
import {
  addRunningChangeListener,
  ringBell,
  setEngineSensitivity,
  startEngine,
  stopEngine,
} from '../../engine/BearbellEngine';
import {
  endLiveActivities,
  setLiveActivityArmed,
  startLiveActivity,
  updateLiveActivity,
} from '../../liveActivity/LiveActivityController';

const useMainScreenState = () => {
  const [isArmed, setIsArmed] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [sensitivity, setSensitivity] = useState<Sensitivity>(Sensitivity.Mid);
  const [ringToken, setRingToken] = useState(0);
  const isArmedRef = useRef(false);
  const isTogglingRef = useRef(false);
  // 켜기 처리 중 감도가 바뀌어도 최신 값을 읽을 수 있도록 ref 로 동기화한다 (docs/Spec.md §2.1)
  const sensitivityRef = useRef<Sensitivity>(Sensitivity.Mid);
  // 토글 처리 중 앱 밖 이벤트가 오면 기록해, 토글 결과가 이벤트 값을 덮어쓰지 않게 한다 (docs/Spec.md §2.0)
  const externalEventDuringToggleRef = useRef(false);

  const updateIsArmed = useCallback((nextIsArmed: boolean) => {
    isArmedRef.current = nextIsArmed;
    setIsArmed(nextIsArmed);
  }, []);

  // 앱 밖(Live Activity·알림 버튼)에서 바뀐 켜짐 상태와 복원 상태를 화면과 Live Activity 에 맞춘다 (docs/Spec.md §2.0)
  // 마운트 시 엔진을 끄지 않고 복원 이벤트(source: restore)로 현재 상태를 따른다 (docs/Spec.md §1.6)
  // 토글 처리 중이어도 네이티브가 알린 값을 우선한다
  useEffect(() => {
    const handleRunningChange = (event: RunningChangeEvent) => {
      if (event.source === RunningChangeSource.App) {
        return;
      }

      // 토글 처리 중 도착한 복원 이벤트는 앱 자신의 전환과 겹친 것이므로 무시한다 (docs/Spec.md §2.0)
      if (event.source === RunningChangeSource.Restore && isTogglingRef.current) {
        return;
      }

      if (isTogglingRef.current) {
        externalEventDuringToggleRef.current = true;
      }

      updateIsArmed(event.isRunning);

      if (event.source === RunningChangeSource.Restore) {
        // 복원은 감도도 따른다 — 네이티브가 이미 가진 값이므로 엔진에 다시 보내지 않는다
        sensitivityRef.current = event.sensitivity;
        setSensitivity(event.sensitivity);
        setLiveActivityArmed(event.isRunning, event.sensitivity);

        return;
      }

      // 앱 밖에서 일어난 변화는 end 하지 않고 켜짐/꺼짐 props 로 갱신한다 — 기다리지 않는다
      setLiveActivityArmed(event.isRunning, sensitivityRef.current);
    };

    const subscription = addRunningChangeListener(handleRunningChange);

    return () => {
      subscription.remove();
    };
  }, [updateIsArmed]);

  const handleToggle = useCallback(async () => {
    if (isTogglingRef.current) {
      return;
    }

    isTogglingRef.current = true;
    externalEventDuringToggleRef.current = false;
    setIsToggling(true);

    try {
      if (isArmedRef.current) {
        await stopEngine();

        // 처리 중 앱 밖 이벤트가 상태를 정했으면 덮어쓰지 않는다
        if (externalEventDuringToggleRef.current) {
          return;
        }

        updateIsArmed(false);
        // 엔진 상태를 되돌리지 않도록 Live Activity 는 기다리지 않는다
        endLiveActivities();
      } else {
        const startedSensitivity = sensitivityRef.current;

        await startEngine(startedSensitivity);

        if (sensitivityRef.current !== startedSensitivity) {
          setEngineSensitivity(sensitivityRef.current);
        }

        // 처리 중 앱 밖 이벤트가 상태를 정했으면 덮어쓰지 않는다
        if (externalEventDuringToggleRef.current) {
          return;
        }

        updateIsArmed(true);
        startLiveActivity(sensitivityRef.current);
      }
    } catch (error) {
      // 시작 실패 시 꺼짐 유지, 중지 실패 시 켜짐 유지
      console.warn('bearbell 엔진 토글 실패', error);
    } finally {
      isTogglingRef.current = false;
      externalEventDuringToggleRef.current = false;
      setIsToggling(false);
    }
  }, [updateIsArmed]);

  const handleSelectSensitivity = useCallback((nextSensitivity: Sensitivity) => {
    sensitivityRef.current = nextSensitivity;
    setSensitivity(nextSensitivity);
    setEngineSensitivity(nextSensitivity);

    if (isArmedRef.current) {
      updateLiveActivity(nextSensitivity);
    }
  }, []);

  const handleRing = useCallback(() => {
    ringBell();
    setRingToken((prev) => prev + 1);
  }, []);

  return {
    isArmed,
    isToggling,
    sensitivity,
    ringToken,
    handleToggle,
    handleSelectSensitivity,
    handleRing,
  };
};

export default useMainScreenState;
