import { render, screen } from '@testing-library/react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import App from '../App';

jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [false, null]),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve(true)),
  hideAsync: jest.fn(() => Promise.resolve(true)),
}));

// SafeAreaProvider 는 jest 에서 네이티브 레이아웃 측정을 기다려 자식을 그리지 않으므로 공식 mock 을 쓴다
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

jest.mock('../screens/main/MainScreen', () => {
  const { Text } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: () => <Text>main-screen</Text>,
  };
});

const mockedUseFonts = useFonts as jest.Mock;
const mockedSplash = SplashScreen as jest.Mocked<typeof SplashScreen>;

describe('App 스플래시', () => {
  beforeEach(() => {
    mockedSplash.hideAsync.mockClear();
  });

  it('모듈 로드 시 스플래시 자동 숨김을 막는다', () => {
    expect(mockedSplash.preventAutoHideAsync).toHaveBeenCalled();
  });

  it('폰트 로드 전에는 스플래시를 유지하고 메인 화면을 그리지 않는다', async () => {
    mockedUseFonts.mockReturnValue([false, null]);

    await render(<App />);

    expect(screen.queryByText('main-screen')).not.toBeOnTheScreen();
    expect(mockedSplash.hideAsync).not.toHaveBeenCalled();
  });

  it('폰트가 로드되면 스플래시를 숨기고 메인 화면을 그린다', async () => {
    mockedUseFonts.mockReturnValue([true, null]);

    await render(<App />);

    expect(screen.getByText('main-screen')).toBeOnTheScreen();
    expect(mockedSplash.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('폰트 로드가 실패해도 스플래시를 숨기고 메인 화면을 그린다', async () => {
    mockedUseFonts.mockReturnValue([false, new Error('font load failed')]);

    await render(<App />);

    expect(screen.getByText('main-screen')).toBeOnTheScreen();
    expect(mockedSplash.hideAsync).toHaveBeenCalledTimes(1);
  });
});
