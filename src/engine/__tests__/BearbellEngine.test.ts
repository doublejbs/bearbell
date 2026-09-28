import { Alert, AppState, PermissionsAndroid, Platform } from 'react-native';

import { Sensitivity } from '../../../modules/bearbell-engine/src/Sensitivity';

jest.mock('../../../modules/bearbell-engine/src/BearbellEngineModule', () => ({
  __esModule: true,
  default: {
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
    setSensitivity: jest.fn(),
    ringOnce: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

let mockLanguageCode = 'ko';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: mockLanguageCode }],
}));

type EngineFacade = typeof import('../BearbellEngine');
type NativeModuleMock = {
  start: jest.Mock;
  stop: jest.Mock;
  setSensitivity: jest.Mock;
  ringOnce: jest.Mock;
  addListener: jest.Mock;
};

const RATIONALE_TITLE = '켜짐 상태를 알림으로 보여드려요';

const setPlatform = (os: 'ios' | 'android', version: number) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  Object.defineProperty(Platform, 'Version', { configurable: true, get: () => version });
};

// 안내 1회 플래그가 모듈 상태이므로 테스트마다 모듈을 새로 불러온다
const loadEngine = () => {
  let facade = {} as EngineFacade;
  let nativeEngine = {} as NativeModuleMock;

  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    facade = require('../BearbellEngine');
    nativeEngine = require('../../../modules/bearbell-engine/src/BearbellEngineModule').default;
    /* eslint-enable @typescript-eslint/no-require-imports */
  });

  return { facade, nativeEngine };
};

// Alert 의 첫 번째 버튼(계속)을 사용자가 누른 것처럼 동작시킨다
const mockAlertPressContinue = () =>
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.[0]?.onPress?.();
  });

describe('BearbellEngine 파사드', () => {
  const originalOS = Platform.OS;
  const originalVersion = Platform.Version;

  afterEach(() => {
    jest.restoreAllMocks();
    mockLanguageCode = 'ko';
  });

  afterAll(() => {
    setPlatform(originalOS as 'ios' | 'android', originalVersion as number);
  });

  it('iOS 에서는 안내·권한 요청 없이 감도를 넘겨 start 한다', async () => {
    setPlatform('ios', 17);
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { facade, nativeEngine } = loadEngine();

    await facade.startEngine(Sensitivity.High);

    expect(alertSpy).not.toHaveBeenCalled();
    expect(nativeEngine.start).toHaveBeenCalledWith('high');
  });

  it('Android 13+ 미허용 상태면 안내 → 권한 요청 → start 순서로 진행한다', async () => {
    setPlatform('android', 33);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const alertSpy = mockAlertPressContinue();
    const requestSpy = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    const { facade, nativeEngine } = loadEngine();

    await facade.startEngine(Sensitivity.Mid);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe(RATIONALE_TITLE);
    expect(alertSpy.mock.calls[0][2]).toEqual([expect.objectContaining({ text: '계속' })]);
    expect(alertSpy.mock.calls[0][3]).toEqual(expect.objectContaining({ cancelable: false }));
    expect(requestSpy).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    expect(alertSpy.mock.invocationCallOrder[0]).toBeLessThan(requestSpy.mock.invocationCallOrder[0]);
    expect(requestSpy.mock.invocationCallOrder[0]).toBeLessThan(
      nativeEngine.start.mock.invocationCallOrder[0],
    );
  });

  it('안내가 버튼 없이 닫혀도(onDismiss) 멈추지 않고 권한 요청 → start 로 진행한다', async () => {
    setPlatform('android', 34);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, _buttons, options) => {
      options?.onDismiss?.();
    });
    const requestSpy = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
    const { facade, nativeEngine } = loadEngine();

    await facade.startEngine(Sensitivity.Mid);

    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(nativeEngine.start).toHaveBeenCalledWith('mid');
  });

  it('안내가 떠 있는 동안 앱이 백그라운드로 가면 멈추지 않고 start 한다', async () => {
    setPlatform('android', 34);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const removeSpy = jest.fn();
    let emitAppState: (state: string) => void = () => {};

    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      emitAppState = listener as (state: string) => void;

      return { remove: removeSpy } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    const { facade, nativeEngine } = loadEngine();

    const pendingStart = facade.startEngine(Sensitivity.Low);

    await Promise.resolve();
    await Promise.resolve();
    emitAppState('background');
    await pendingStart;

    expect(nativeEngine.start).toHaveBeenCalledWith('low');
    expect(removeSpy).toHaveBeenCalled();
  });

  it('기기 언어가 일본어면 안내도 일본어로 띄운다', async () => {
    mockLanguageCode = 'ja';
    setPlatform('android', 34);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    const alertSpy = mockAlertPressContinue();
    const { facade } = loadEngine();

    await facade.startEngine(Sensitivity.Mid);

    expect(alertSpy.mock.calls[0][0]).toBe('オン状態を通知でお知らせします');
    expect(alertSpy.mock.calls[0][2]).toEqual([expect.objectContaining({ text: '続ける' })]);
  });

  it('이미 허용돼 있으면 안내·요청 없이 바로 start 한다', async () => {
    setPlatform('android', 34);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
    const alertSpy = jest.spyOn(Alert, 'alert');
    const requestSpy = jest.spyOn(PermissionsAndroid, 'request');
    const { facade, nativeEngine } = loadEngine();

    await facade.startEngine(Sensitivity.Low);

    expect(alertSpy).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
    expect(nativeEngine.start).toHaveBeenCalledWith('low');
  });

  it('권한이 거부돼도 start 하고, 같은 프로세스에서는 안내·요청을 다시 하지 않는다', async () => {
    setPlatform('android', 34);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const alertSpy = mockAlertPressContinue();
    const requestSpy = jest
      .spyOn(PermissionsAndroid, 'request')
      .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
    const { facade, nativeEngine } = loadEngine();

    await facade.startEngine(Sensitivity.Low);
    await facade.startEngine(Sensitivity.Low);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(requestSpy).toHaveBeenCalledTimes(1);
    expect(nativeEngine.start).toHaveBeenCalledTimes(2);
  });

  it('권한 확인·요청 자체가 실패해도 엔진은 시작한다', async () => {
    setPlatform('android', 35);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(PermissionsAndroid, 'check').mockRejectedValue(new Error('no activity'));
    jest.spyOn(PermissionsAndroid, 'request').mockRejectedValue(new Error('no activity'));
    mockAlertPressContinue();
    const { facade, nativeEngine } = loadEngine();

    await facade.startEngine(Sensitivity.High);

    expect(nativeEngine.start).toHaveBeenCalledWith('high');
  });

  it('Android 12 이하에서는 안내·권한 요청을 하지 않는다', async () => {
    setPlatform('android', 32);
    const alertSpy = jest.spyOn(Alert, 'alert');
    const requestSpy = jest.spyOn(PermissionsAndroid, 'request');
    const { facade, nativeEngine } = loadEngine();

    await facade.startEngine(Sensitivity.Mid);

    expect(alertSpy).not.toHaveBeenCalled();
    expect(requestSpy).not.toHaveBeenCalled();
    expect(nativeEngine.start).toHaveBeenCalledWith('mid');
  });

  it('addRunningChangeListener 는 네이티브 onRunningChange 이벤트를 구독한다', () => {
    const { facade, nativeEngine } = loadEngine();
    const listener = jest.fn();

    const subscription = facade.addRunningChangeListener(listener);

    expect(nativeEngine.addListener).toHaveBeenCalledWith('onRunningChange', listener);
    expect(subscription).toHaveProperty('remove');
  });

  it('stopEngine / setEngineSensitivity / ringBell 은 네이티브로 위임한다', async () => {
    const { facade, nativeEngine } = loadEngine();

    await facade.stopEngine();
    facade.setEngineSensitivity(Sensitivity.Low);
    facade.ringBell();

    expect(nativeEngine.stop).toHaveBeenCalledTimes(1);
    expect(nativeEngine.setSensitivity).toHaveBeenCalledWith('low');
    expect(nativeEngine.ringOnce).toHaveBeenCalledTimes(1);
  });
});
