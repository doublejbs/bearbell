import { act, renderHook } from '@testing-library/react-native';

import { RunningChangeSource } from '../../../../modules/bearbell-engine/src/RunningChangeSource';
import { Sensitivity } from '../../../../modules/bearbell-engine/src/Sensitivity';
import * as Engine from '../../../engine/BearbellEngine';
import * as LiveActivity from '../../../liveActivity/LiveActivityController';
import useMainScreenState from '../useMainScreenState';

type RunningChangeListener = (event: {
  isRunning: boolean;
  source: RunningChangeSource;
  sensitivity: Sensitivity;
}) => void;

const mockRemoveSubscription = jest.fn();
let mockRunningChangeListener: RunningChangeListener = () => {};

jest.mock('../../../engine/BearbellEngine', () => ({
  startEngine: jest.fn(() => Promise.resolve()),
  stopEngine: jest.fn(() => Promise.resolve()),
  setEngineSensitivity: jest.fn(),
  ringBell: jest.fn(),
  addRunningChangeListener: jest.fn((listener: RunningChangeListener) => {
    mockRunningChangeListener = listener;

    return { remove: mockRemoveSubscription };
  }),
}));

jest.mock('../../../liveActivity/LiveActivityController', () => ({
  startLiveActivity: jest.fn(() => Promise.resolve()),
  updateLiveActivity: jest.fn(() => Promise.resolve()),
  setLiveActivityArmed: jest.fn(() => Promise.resolve()),
  endLiveActivities: jest.fn(() => Promise.resolve()),
}));

const mockedEngine = Engine as jest.Mocked<typeof Engine>;
const mockedLiveActivity = LiveActivity as jest.Mocked<typeof LiveActivity>;

describe('useMainScreenState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('초기 상태는 꺼짐, 감도 보통, ringToken 0 이다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    expect(result.current.isArmed).toBe(false);
    expect(result.current.sensitivity).toBe(Sensitivity.Mid);
    expect(result.current.ringToken).toBe(0);
    expect(result.current.isToggling).toBe(false);
  });

  it('마운트만으로는 엔진을 끄거나 Live Activity 를 정리하지 않는다 (앱 밖에서 켠 엔진 보호)', async () => {
    await renderHook(() => useMainScreenState());

    expect(mockedEngine.stopEngine).not.toHaveBeenCalled();
    expect(mockedEngine.startEngine).not.toHaveBeenCalled();
    expect(mockedLiveActivity.endLiveActivities).not.toHaveBeenCalled();
    expect(mockedLiveActivity.startLiveActivity).not.toHaveBeenCalled();
  });

  it('복원 이벤트로 켜짐 상태와 감도를 그대로 따른다 — 엔진에 다시 보내지 않는다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      mockRunningChangeListener({
        isRunning: true,
        source: RunningChangeSource.Restore,
        sensitivity: Sensitivity.High,
      });
    });

    expect(result.current.isArmed).toBe(true);
    expect(result.current.sensitivity).toBe(Sensitivity.High);
    expect(mockedLiveActivity.setLiveActivityArmed).toHaveBeenCalledWith(true, Sensitivity.High);
    expect(mockedEngine.setEngineSensitivity).not.toHaveBeenCalled();
    expect(mockedEngine.startEngine).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleToggle();
    });

    expect(mockedEngine.stopEngine).toHaveBeenCalledTimes(1);
    expect(result.current.isArmed).toBe(false);
  });

  it('켜기 처리 중에 도착한 복원 이벤트는 무시하고 토글 결과를 따른다', async () => {
    let resolveStart: () => void = () => {};

    mockedEngine.startEngine.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
    const { result } = await renderHook(() => useMainScreenState());

    let pendingToggle: Promise<void> = Promise.resolve();

    await act(async () => {
      pendingToggle = result.current.handleToggle();
    });
    await act(async () => {
      mockRunningChangeListener({
        isRunning: false,
        source: RunningChangeSource.Restore,
        sensitivity: Sensitivity.Mid,
      });
    });
    await act(async () => {
      resolveStart();
      await pendingToggle;
    });

    expect(result.current.isArmed).toBe(true);
    expect(mockedLiveActivity.startLiveActivity).toHaveBeenCalledWith(Sensitivity.Mid);
    expect(mockedLiveActivity.setLiveActivityArmed).not.toHaveBeenCalled();
  });

  it('복원 이벤트가 꺼짐이면 꺼짐으로 두고, 이후 켜기는 복원된 감도로 시작한다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      mockRunningChangeListener({
        isRunning: false,
        source: RunningChangeSource.Restore,
        sensitivity: Sensitivity.Low,
      });
    });

    expect(result.current.isArmed).toBe(false);
    expect(result.current.sensitivity).toBe(Sensitivity.Low);
    expect(mockedLiveActivity.setLiveActivityArmed).toHaveBeenCalledWith(false, Sensitivity.Low);

    await act(async () => {
      await result.current.handleToggle();
    });

    expect(mockedEngine.startEngine).toHaveBeenCalledWith(Sensitivity.Low);
  });

  it('엔진을 켜면 Live Activity 를 시작하고, 끄면 종료한다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      await result.current.handleToggle();
    });

    expect(mockedLiveActivity.startLiveActivity).toHaveBeenCalledWith(Sensitivity.Mid);
    expect(mockedEngine.startEngine.mock.invocationCallOrder[0]).toBeLessThan(
      mockedLiveActivity.startLiveActivity.mock.invocationCallOrder[0],
    );

    await act(async () => {
      await result.current.handleToggle();
    });

    expect(mockedLiveActivity.endLiveActivities).toHaveBeenCalledTimes(1);
  });

  it('켜진 상태에서만 감도 변경을 Live Activity 에 반영한다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      result.current.handleSelectSensitivity(Sensitivity.High);
    });

    expect(mockedLiveActivity.updateLiveActivity).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleToggle();
    });
    await act(async () => {
      result.current.handleSelectSensitivity(Sensitivity.Low);
    });

    expect(mockedLiveActivity.updateLiveActivity).toHaveBeenCalledWith(Sensitivity.Low);
  });

  it('토글하면 현재 감도로 엔진을 켜고, 다시 토글하면 끈다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      await result.current.handleToggle();
    });

    expect(mockedEngine.startEngine).toHaveBeenCalledWith(Sensitivity.Mid);
    expect(result.current.isArmed).toBe(true);

    await act(async () => {
      await result.current.handleToggle();
    });

    expect(mockedEngine.stopEngine).toHaveBeenCalledTimes(1);
    expect(result.current.isArmed).toBe(false);
  });

  it('엔진 시작이 실패하면 꺼짐 상태를 유지한다', async () => {
    mockedEngine.startEngine.mockRejectedValueOnce(new Error('boom'));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      await result.current.handleToggle();
    });

    expect(result.current.isArmed).toBe(false);
    expect(result.current.isToggling).toBe(false);
    expect(mockedLiveActivity.startLiveActivity).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('처리 중에 다시 토글하면 무시한다', async () => {
    let resolveStart: () => void = () => {};

    mockedEngine.startEngine.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
    const { result } = await renderHook(() => useMainScreenState());

    let firstToggle: Promise<void> = Promise.resolve();

    await act(async () => {
      firstToggle = result.current.handleToggle();
    });

    expect(result.current.isToggling).toBe(true);

    await act(async () => {
      await result.current.handleToggle();
    });

    expect(mockedEngine.startEngine).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStart();
      await firstToggle;
    });

    expect(result.current.isArmed).toBe(true);
    expect(result.current.isToggling).toBe(false);
  });

  it('켜기 처리 중에 감도를 바꾸면 시작 후 최신 감도를 엔진과 Live Activity 에 적용한다', async () => {
    let resolveStart: () => void = () => {};

    mockedEngine.startEngine.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve;
        }),
    );
    const { result } = await renderHook(() => useMainScreenState());

    let pendingToggle: Promise<void> = Promise.resolve();

    await act(async () => {
      pendingToggle = result.current.handleToggle();
    });
    await act(async () => {
      result.current.handleSelectSensitivity(Sensitivity.Low);
    });
    mockedEngine.setEngineSensitivity.mockClear();

    await act(async () => {
      resolveStart();
      await pendingToggle;
    });

    expect(mockedEngine.startEngine).toHaveBeenCalledWith(Sensitivity.Mid);
    expect(mockedEngine.setEngineSensitivity).toHaveBeenCalledWith(Sensitivity.Low);
    expect(mockedLiveActivity.startLiveActivity).toHaveBeenCalledWith(Sensitivity.Low);
  });

  it('Live Activity 버튼으로 꺼지면 화면을 꺼짐으로 맞추고 Live Activity 를 end 하지 않고 꺼짐으로 갱신한다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      await result.current.handleToggle();
    });
    mockedLiveActivity.endLiveActivities.mockClear();

    await act(async () => {
      mockRunningChangeListener({
        isRunning: false,
        source: RunningChangeSource.LiveActivity,
        sensitivity: Sensitivity.Mid,
      });
    });

    expect(result.current.isArmed).toBe(false);
    expect(mockedLiveActivity.setLiveActivityArmed).toHaveBeenCalledWith(false, Sensitivity.Mid);
    expect(mockedLiveActivity.endLiveActivities).not.toHaveBeenCalled();
    expect(mockedEngine.stopEngine).not.toHaveBeenCalled();
  });

  it('알림 버튼으로 켜지면 화면을 켜짐으로 맞추고 Live Activity 를 켜짐으로 갱신한다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      mockRunningChangeListener({
        isRunning: true,
        source: RunningChangeSource.Notification,
        sensitivity: Sensitivity.Mid,
      });
    });

    expect(result.current.isArmed).toBe(true);
    expect(mockedLiveActivity.setLiveActivityArmed).toHaveBeenCalledWith(true, Sensitivity.Mid);
    expect(mockedEngine.startEngine).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.handleToggle();
    });

    expect(mockedEngine.stopEngine).toHaveBeenCalledTimes(1);
    expect(result.current.isArmed).toBe(false);
  });

  it('앱에서 일어난 상태 변화 이벤트(source: app)는 무시한다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      mockRunningChangeListener({
        isRunning: true,
        source: RunningChangeSource.App,
        sensitivity: Sensitivity.Mid,
      });
    });

    expect(result.current.isArmed).toBe(false);
    expect(mockedLiveActivity.setLiveActivityArmed).not.toHaveBeenCalled();
  });

  it('언마운트하면 상태 이벤트 구독을 해제한다', async () => {
    const { unmount } = await renderHook(() => useMainScreenState());

    await unmount();

    expect(mockRemoveSubscription).toHaveBeenCalledTimes(1);
  });

  it('감도를 바꾸면 상태와 네이티브 감도를 함께 갱신한다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      result.current.handleSelectSensitivity(Sensitivity.High);
    });

    expect(result.current.sensitivity).toBe(Sensitivity.High);
    expect(mockedEngine.setEngineSensitivity).toHaveBeenCalledWith(Sensitivity.High);

    await act(async () => {
      await result.current.handleToggle();
    });

    expect(mockedEngine.startEngine).toHaveBeenCalledWith(Sensitivity.High);
  });

  it('곰을 탭하면 종을 한 번 울리고 ringToken 이 증가한다', async () => {
    const { result } = await renderHook(() => useMainScreenState());

    await act(async () => {
      result.current.handleRing();
    });

    expect(mockedEngine.ringBell).toHaveBeenCalledTimes(1);
    expect(result.current.ringToken).toBe(1);
  });
});
