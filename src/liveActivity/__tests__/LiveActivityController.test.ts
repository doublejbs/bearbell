import { Platform } from 'react-native';

import { Sensitivity } from '../../../modules/bearbell-engine/src/Sensitivity';
import BearbellLiveActivity from '../BearbellLiveActivity';
import {
  endLiveActivities,
  setLiveActivityArmed,
  startLiveActivity,
  updateLiveActivity,
} from '../LiveActivityController';

jest.mock('../BearbellLiveActivity', () => ({
  __esModule: true,
  default: {
    start: jest.fn(),
    getInstances: jest.fn(() => []),
  },
}));

let mockLanguageCode = 'ko';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: mockLanguageCode }],
}));

type InstanceMock = { update: jest.Mock; end: jest.Mock };

const NOW_MS = 1_700_000_000_000;
const STALE_AFTER_MS = 3 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

const mockedActivity = BearbellLiveActivity as unknown as {
  start: jest.Mock;
  getInstances: jest.Mock;
};

const createInstance = (): InstanceMock => ({
  update: jest.fn(() => Promise.resolve()),
  end: jest.fn(() => Promise.resolve()),
});

const setPlatform = (os: 'ios' | 'android') => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
};

describe('LiveActivityController', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW_MS });
    jest.clearAllMocks();
    mockedActivity.start.mockReset();
    mockedActivity.getInstances.mockReset();
    mockedActivity.getInstances.mockReturnValue([]);
    setPlatform('ios');
    mockLanguageCode = 'ko';
  });

  afterEach(async () => {
    mockedActivity.getInstances.mockReturnValue([]);
    await endLiveActivities();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  afterAll(() => {
    setPlatform(originalOS as 'ios' | 'android');
  });

  it('남은 인스턴스를 정리한 뒤 감도 라벨·시작 시각·staleDate 로 새로 시작한다', async () => {
    const leftover = createInstance();

    mockedActivity.getInstances.mockReturnValueOnce([leftover]);

    await startLiveActivity(Sensitivity.High);

    expect(leftover.end).toHaveBeenCalledWith('immediate');
    expect(mockedActivity.start).toHaveBeenCalledWith(
      expect.objectContaining({ sensitivityLabel: '예민', startedAtMs: NOW_MS, isArmed: true }),
      undefined,
      new Date(NOW_MS + STALE_AFTER_MS),
    );
    expect(leftover.end.mock.invocationCallOrder[0]).toBeLessThan(
      mockedActivity.start.mock.invocationCallOrder[0],
    );
  });

  it('Live Activity 문구(copy)를 기기 언어로 번역해 props 로 넘긴다', async () => {
    mockLanguageCode = 'en';

    await startLiveActivity(Sensitivity.Mid);

    expect(mockedActivity.start).toHaveBeenCalledWith(
      expect.objectContaining({
        sensitivityLabel: 'Medium',
        copy: expect.objectContaining({
          armedTitle: 'bearbell on',
          armedDetail: 'Medium sensitivity · Shake to ring',
          offTitle: 'bearbell off',
          stopLabel: 'Turn off',
          startLabel: 'Turn on',
        }),
      }),
      undefined,
      expect.any(Date),
    );
  });

  it('한국어 기기에서는 한국어 copy 를 넘긴다', async () => {
    await startLiveActivity(Sensitivity.High);

    expect(mockedActivity.start).toHaveBeenCalledWith(
      expect.objectContaining({
        copy: expect.objectContaining({
          armedTitle: 'bearbell 켜짐',
          armedDetail: '감도 예민 · 흔들면 울려요',
          staleTitle: 'bearbell 상태 확인 필요',
          offDetail: '버튼을 눌러 다시 켤 수 있어요',
          compactOff: '꺼짐',
          compactStale: '확인',
        }),
      }),
      undefined,
      expect.any(Date),
    );
  });

  it('남은 인스턴스 종료가 실패해도 새로 시작한다', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = createInstance();

    broken.end.mockRejectedValue(new Error('not found'));
    mockedActivity.getInstances.mockReturnValueOnce([broken, createInstance()]);

    await startLiveActivity(Sensitivity.Mid);

    expect(mockedActivity.start).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('감도 갱신 시 시작 시각은 유지하고 staleDate 를 새로 넘긴다', async () => {
    const instance = createInstance();

    mockedActivity.start.mockReturnValue(instance);
    await startLiveActivity(Sensitivity.Mid);
    mockedActivity.getInstances.mockReturnValue([instance]);

    jest.setSystemTime(NOW_MS + 5_000);
    await updateLiveActivity(Sensitivity.Low);

    expect(instance.update).toHaveBeenCalledWith(
      expect.objectContaining({ sensitivityLabel: '둔감', startedAtMs: NOW_MS, isArmed: true }),
      new Date(NOW_MS + 5_000 + STALE_AFTER_MS),
    );
  });

  it('켜져 있는 동안 60초마다 같은 props 로 staleDate 를 갱신하고, 종료하면 멈춘다', async () => {
    const instance = createInstance();

    mockedActivity.start.mockReturnValue(instance);
    await startLiveActivity(Sensitivity.Mid);
    mockedActivity.getInstances.mockReturnValue([instance]);

    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS);

    expect(instance.update).toHaveBeenCalledTimes(1);
    expect(instance.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ sensitivityLabel: '보통', startedAtMs: NOW_MS, isArmed: true }),
      new Date(NOW_MS + HEARTBEAT_MS + STALE_AFTER_MS),
    );

    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS);

    expect(instance.update).toHaveBeenCalledTimes(2);

    await endLiveActivities();
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);

    expect(instance.update).toHaveBeenCalledTimes(2);
  });

  it('감도를 바꾸면 heartbeat 도 새 감도로 갱신한다', async () => {
    const instance = createInstance();

    mockedActivity.start.mockReturnValue(instance);
    await startLiveActivity(Sensitivity.Mid);
    mockedActivity.getInstances.mockReturnValue([instance]);
    await updateLiveActivity(Sensitivity.High);
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS);

    expect(instance.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ sensitivityLabel: '예민', startedAtMs: NOW_MS, isArmed: true }),
      expect.any(Date),
    );
  });

  it('호출 순서를 보장한다 — 끝나기 전에 연달아 호출해도 start 뒤의 end 가 마지막에 실행된다', async () => {
    const instance = createInstance();

    mockedActivity.start.mockImplementation(() => {
      mockedActivity.getInstances.mockReturnValue([instance]);

      return instance;
    });

    const pendingStart = startLiveActivity(Sensitivity.Mid);
    const pendingEnd = endLiveActivities();

    await Promise.all([pendingStart, pendingEnd]);

    expect(mockedActivity.start).toHaveBeenCalledTimes(1);
    expect(instance.end).toHaveBeenCalledWith('immediate');
    expect(mockedActivity.start.mock.invocationCallOrder[0]).toBeLessThan(
      instance.end.mock.invocationCallOrder[0],
    );
  });

  it('꺼짐으로 바꾸면 end 하지 않고 꺼짐 props 로 갱신하며 staleDate·heartbeat 를 멈춘다', async () => {
    const instance = createInstance();

    mockedActivity.start.mockReturnValue(instance);
    await startLiveActivity(Sensitivity.Mid);
    mockedActivity.getInstances.mockReturnValue([instance]);

    await setLiveActivityArmed(false, Sensitivity.Mid);

    expect(instance.end).not.toHaveBeenCalled();
    expect(instance.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ sensitivityLabel: '보통', startedAtMs: NOW_MS, isArmed: false }),
    );
    expect(instance.update.mock.lastCall).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);

    expect(instance.update).toHaveBeenCalledTimes(1);
  });

  it('다시 켜짐으로 바꾸면 새 시작 시각·staleDate 로 갱신하고 heartbeat 를 재개한다', async () => {
    const instance = createInstance();

    mockedActivity.start.mockReturnValue(instance);
    await startLiveActivity(Sensitivity.Mid);
    mockedActivity.getInstances.mockReturnValue([instance]);
    await setLiveActivityArmed(false, Sensitivity.Mid);

    jest.setSystemTime(NOW_MS + 10_000);
    await setLiveActivityArmed(true, Sensitivity.High);

    expect(instance.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ sensitivityLabel: '예민', startedAtMs: NOW_MS + 10_000, isArmed: true }),
      new Date(NOW_MS + 10_000 + STALE_AFTER_MS),
    );

    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS);

    expect(instance.update).toHaveBeenCalledTimes(3);
  });

  it('이미 켜짐 표시인 인스턴스에 켜짐을 다시 적용하면 경과 타이머 시작 시각을 유지한다', async () => {
    const instance = createInstance();

    mockedActivity.start.mockReturnValue(instance);
    await startLiveActivity(Sensitivity.Mid);
    mockedActivity.getInstances.mockReturnValue([instance]);

    jest.setSystemTime(NOW_MS + 30_000);
    await setLiveActivityArmed(true, Sensitivity.High);

    expect(instance.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ sensitivityLabel: '예민', startedAtMs: NOW_MS, isArmed: true }),
      new Date(NOW_MS + 30_000 + STALE_AFTER_MS),
    );
  });

  it('heartbeat 는 매번 현재 기기 언어로 copy 를 다시 만든다', async () => {
    const instance = createInstance();

    mockedActivity.start.mockReturnValue(instance);
    await startLiveActivity(Sensitivity.Mid);
    mockedActivity.getInstances.mockReturnValue([instance]);

    mockLanguageCode = 'ja';
    await jest.advanceTimersByTimeAsync(HEARTBEAT_MS);

    expect(instance.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sensitivityLabel: '中',
        copy: expect.objectContaining({ armedTitle: 'bearbell オン' }),
      }),
      expect.any(Date),
    );
  });

  it('인스턴스가 없을 때 켜짐으로 바꾸면 새로 시작한다', async () => {
    await setLiveActivityArmed(true, Sensitivity.Low);

    expect(mockedActivity.start).toHaveBeenCalledWith(
      expect.objectContaining({ sensitivityLabel: '둔감', startedAtMs: NOW_MS, isArmed: true }),
      undefined,
      new Date(NOW_MS + STALE_AFTER_MS),
    );
  });

  it('모든 인스턴스를 즉시 종료한다', async () => {
    const first = createInstance();
    const second = createInstance();

    mockedActivity.getInstances.mockReturnValueOnce([first, second]);

    await endLiveActivities();

    expect(first.end).toHaveBeenCalledWith('immediate');
    expect(second.end).toHaveBeenCalledWith('immediate');
  });

  it('iOS 가 아니면 아무것도 하지 않는다', async () => {
    setPlatform('android');

    await startLiveActivity(Sensitivity.Mid);
    await updateLiveActivity(Sensitivity.Mid);
    await setLiveActivityArmed(false, Sensitivity.Mid);
    await endLiveActivities();

    expect(mockedActivity.start).not.toHaveBeenCalled();
    expect(mockedActivity.getInstances).not.toHaveBeenCalled();
  });

  it('Live Activity 실패는 경고만 남기고 예외를 던지지 않는다', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockedActivity.start.mockImplementationOnce(() => {
      throw new Error('activities disabled');
    });

    await expect(startLiveActivity(Sensitivity.Mid)).resolves.toBeUndefined();

    mockedActivity.getInstances.mockImplementation(() => {
      throw new Error('boom');
    });

    await expect(endLiveActivities()).resolves.toBeUndefined();
    await expect(updateLiveActivity(Sensitivity.Mid)).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    mockedActivity.getInstances.mockReset();
    warnSpy.mockRestore();
  });
});
