import { render, screen, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import * as Engine from '../../../engine/BearbellEngine';
import MainScreen from '../MainScreen';

jest.mock('../../../engine/BearbellEngine', () => ({
  startEngine: jest.fn(() => Promise.resolve()),
  stopEngine: jest.fn(() => Promise.resolve()),
  setEngineSensitivity: jest.fn(),
  ringBell: jest.fn(),
  addRunningChangeListener: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock('../../../liveActivity/LiveActivityController', () => ({
  startLiveActivity: jest.fn(() => Promise.resolve()),
  updateLiveActivity: jest.fn(() => Promise.resolve()),
  setLiveActivityArmed: jest.fn(() => Promise.resolve()),
  endLiveActivities: jest.fn(() => Promise.resolve()),
}));

let mockLanguageCode = 'ko';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: mockLanguageCode }],
  useLocales: () => [{ languageCode: mockLanguageCode }],
}));

const mockedEngine = Engine as jest.Mocked<typeof Engine>;

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = () =>
  render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <MainScreen />
    </SafeAreaProvider>,
  );

describe('MainScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLanguageCode = 'ko';
  });

  it('타이틀, 꺼짐 상태 문구, 감도 3칸, 켜기 버튼을 렌더한다', async () => {
    await renderScreen();

    expect(screen.getByText('bearbell')).toBeOnTheScreen();
    expect(screen.getByText('잠시 꺼둠')).toBeOnTheScreen();
    expect(screen.getByText('조용히 해야 할 땐 꺼두세요')).toBeOnTheScreen();
    expect(screen.getByText('흔들림 감도')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: '보통' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '예민' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '켜기' })).toBeOnTheScreen();
  });

  it('켜기를 누르면 켜짐 상태 문구와 끄기 버튼으로 바뀐다', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.press(screen.getByRole('button', { name: '켜기' }));

    expect(await screen.findByText('흔들면 울려요')).toBeOnTheScreen();
    expect(screen.getByText('걸을 때 주머니나 가방에 넣어두세요')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '끄기' })).toBeSelected();
    expect(mockedEngine.startEngine).toHaveBeenCalledWith('mid');
  });

  it('감도 칸을 누르면 선택이 바뀐다', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.press(screen.getByRole('radio', { name: '둔감' }));

    expect(screen.getByRole('radio', { name: '둔감' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '보통' })).not.toBeChecked();
    expect(mockedEngine.setEngineSensitivity).toHaveBeenCalledWith('low');
  });

  it('곰을 탭하면 종을 한 번 울린다', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.press(screen.getByRole('button', { name: '방울 울리기' }));

    expect(mockedEngine.ringBell).toHaveBeenCalledTimes(1);
  });

  it('기기 언어가 영어면 영어로 표시한다', async () => {
    mockLanguageCode = 'en';
    await renderScreen();

    expect(screen.getByText('bearbell')).toBeOnTheScreen();
    expect(screen.getByText('Paused')).toBeOnTheScreen();
    expect(screen.getByText('Shake sensitivity')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Medium' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ring the bell' })).toBeOnTheScreen();
  });

  it('기기 언어가 일본어면 일본어로 표시한다', async () => {
    mockLanguageCode = 'ja';
    await renderScreen();

    expect(screen.getByText('一時停止中')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: '中' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'オンにする' })).toBeOnTheScreen();
  });
});
