import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { createLiveActivity, type LiveActivityEnvironment, type LiveActivityLayout } from 'expo-widgets';

import '../BearbellLiveActivity';
import type { BearbellLiveActivityCopy, BearbellLiveActivityProps } from '../BearbellLiveActivity';

jest.mock('expo-widgets', () => ({
  createLiveActivity: jest.fn((name: string, layout: unknown) => ({ name, layout })),
}));

// 'widget' 함수는 babel-preset-expo 의 widgets 플러그인이 문자열로 직렬화해 createLiveActivity 에 넘긴다.
// 네이티브 런타임처럼 그 문자열을 평가하되, 자유 식별자(JSX 런타임·SwiftUI 컴포넌트·modifier)를 테스트용 구현으로 주입한다.
// 주입하지 않은 식별자를 참조하면 ReferenceError 로 실패하므로 '함수 본문만으로 자기완결' 규칙(docs/Spec.md §2.1)도 함께 검증된다.

type ElementProps = {
  children?: ReactNode;
  modifiers?: ModifierDescriptor[];
  [key: string]: unknown;
};

type ModifierDescriptor = {
  type: string;
  args: unknown[];
};

type LayoutFunction = (
  props: BearbellLiveActivityProps,
  environment: LiveActivityEnvironment,
) => LiveActivityLayout;

const createComponent = (name: string) => {
  const Component = (_props: ElementProps) => null;

  Component.displayName = name;

  return Component;
};

const Button = createComponent('Button');
const HStack = createComponent('HStack');
const Image = createComponent('Image');
const Spacer = createComponent('Spacer');
const Text = createComponent('Text');
const VStack = createComponent('VStack');

const createModifier =
  (type: string) =>
  (...args: unknown[]): ModifierDescriptor => ({ type, args });

const MODIFIER_NAMES = [
  'activityBackgroundTint',
  'buttonStyle',
  'font',
  'foregroundStyle',
  'padding',
  'tint',
];

const WIDGET_SCOPE: Record<string, unknown> = {
  _jsx: jsx,
  _jsxs: jsxs,
  _Fragment: Fragment,
  Button,
  HStack,
  Image,
  Spacer,
  Text,
  VStack,
  ...Object.fromEntries(MODIFIER_NAMES.map((name) => [name, createModifier(name)])),
};

const LAYOUT_REGIONS = [
  'banner',
  'compactLeading',
  'compactTrailing',
  'minimal',
  'expandedLeading',
  'expandedCenter',
  'expandedBottom',
] as const;

const ACCENT_COLOR = '#B8862B';
const LUMINANCE_REDUCED_ACCENT_COLOR = '#F2EDE1';
const MUTED_COLOR = '#9AA39B';

const COPY: BearbellLiveActivityCopy = {
  armedTitle: 'bearbell 켜짐',
  armedDetail: '흔들면 울려요',
  offTitle: 'bearbell 꺼짐',
  offDetail: '버튼을 눌러 다시 켤 수 있어요',
  staleTitle: 'bearbell 상태 확인 필요',
  staleDetail: '앱을 열어 켜짐 상태를 확인하세요',
  compactOff: '꺼짐',
  compactStale: '확인',
  stopLabel: '끄기',
  startLabel: '켜기',
};

const SENSITIVITY_LABEL = '딸랑';

const createProps = (isArmed: boolean): BearbellLiveActivityProps => ({
  copy: COPY,
  sensitivityLabel: SENSITIVITY_LABEL,
  startedAtMs: 1_700_000_000_000,
  isArmed,
});

const createEnvironment = (overrides: Partial<LiveActivityEnvironment> = {}): LiveActivityEnvironment => ({
  colorScheme: 'dark',
  isLuminanceReduced: false,
  isStale: false,
  ...overrides,
});

const loadLayoutFunction = (): LayoutFunction => {
  const calls = jest.mocked(createLiveActivity).mock.calls;

  expect(calls).toHaveLength(1);

  const [name, layout] = calls[0] as [string, unknown];

  expect(name).toBe('BearbellActivity');
  expect(typeof layout).toBe('string');

  const scopeNames = Object.keys(WIDGET_SCOPE);
  const factory = new Function(...scopeNames, `return (${layout as string});`);

  return factory(...scopeNames.map((scopeName) => WIDGET_SCOPE[scopeName])) as LayoutFunction;
};

const renderLayout = (isArmed: boolean, environment: LiveActivityEnvironment = createEnvironment()) =>
  loadLayoutFunction()(createProps(isArmed), environment);

const collectElements = (node: ReactNode): ReactElement<ElementProps>[] => {
  if (Array.isArray(node)) {
    return node.flatMap((child: ReactNode) => collectElements(child));
  }

  if (!isValidElement<ElementProps>(node)) {
    return [];
  }

  return [node, ...collectElements(node.props.children)];
};

const collectLayoutElements = (layout: LiveActivityLayout) =>
  LAYOUT_REGIONS.flatMap((region) => collectElements(layout[region]));

const getElement = (node: ReactNode): ReactElement<ElementProps> => {
  expect(isValidElement(node)).toBe(true);

  return node as ReactElement<ElementProps>;
};

const getForegroundColor = (element: ReactElement<ElementProps>) => {
  const modifier = (element.props.modifiers ?? []).find((descriptor) => descriptor.type === 'foregroundStyle');

  return modifier?.args[0];
};

const getBannerButton = (layout: LiveActivityLayout) => {
  const buttons = collectElements(layout.banner).filter((element) => element.type === Button);

  expect(buttons).toHaveLength(1);

  return buttons[0];
};

const SCENARIOS = [
  { title: '켜짐', isArmed: true, environment: createEnvironment() },
  { title: '켜짐 + stale', isArmed: true, environment: createEnvironment({ isStale: true }) },
  { title: '꺼짐', isArmed: false, environment: createEnvironment() },
  { title: '켜짐 + 저휘도', isArmed: true, environment: createEnvironment({ isLuminanceReduced: true }) },
];

describe('BearbellLiveActivity 레이아웃', () => {
  it('BearbellActivity 이름으로 createLiveActivity 에 등록한다', () => {
    expect(typeof loadLayoutFunction()).toBe('function');
  });

  it('모든 영역에 렌더 가능한 요소를 반환한다', () => {
    const layout = renderLayout(true);

    LAYOUT_REGIONS.forEach((region) => {
      expect(collectElements(layout[region]).length).toBeGreaterThan(0);
    });
  });

  describe.each(SCENARIOS)('$title', ({ isArmed, environment }) => {
    it('어느 영역에도 경과 시간 타이머(date/dateStyle)가 없다', () => {
      const timerElements = collectLayoutElements(renderLayout(isArmed, environment)).filter(
        (element) => 'date' in element.props || 'dateStyle' in element.props,
      );

      expect(timerElements).toEqual([]);
    });
  });

  describe('compactTrailing', () => {
    it('켜짐이면 감도 라벨을 강조색으로 보여준다', () => {
      const trailing = getElement(renderLayout(true).compactTrailing);

      expect(trailing.type).toBe(Text);
      expect(trailing.props.children).toBe(SENSITIVITY_LABEL);
      expect(getForegroundColor(trailing)).toBe(ACCENT_COLOR);
    });

    it('켜짐 + 저휘도면 감도 라벨을 저휘도 강조색으로 보여준다', () => {
      const trailing = getElement(
        renderLayout(true, createEnvironment({ isLuminanceReduced: true })).compactTrailing,
      );

      expect(trailing.type).toBe(Text);
      expect(trailing.props.children).toBe(SENSITIVITY_LABEL);
      expect(getForegroundColor(trailing)).toBe(LUMINANCE_REDUCED_ACCENT_COLOR);
    });

    it('켜짐 + stale 이면 확인 문구를 흐린 색으로 보여준다', () => {
      const trailing = getElement(renderLayout(true, createEnvironment({ isStale: true })).compactTrailing);

      expect(trailing.type).toBe(Text);
      expect(trailing.props.children).toBe(COPY.compactStale);
      expect(getForegroundColor(trailing)).toBe(MUTED_COLOR);
    });

    it('꺼짐이면 꺼짐 문구를 흐린 색으로 보여준다', () => {
      const trailing = getElement(renderLayout(false).compactTrailing);

      expect(trailing.type).toBe(Text);
      expect(trailing.props.children).toBe(COPY.compactOff);
      expect(getForegroundColor(trailing)).toBe(MUTED_COLOR);
    });
  });

  describe('banner 버튼', () => {
    it('켜짐이면 bearbell-stop 끄기 버튼이다', () => {
      const button = getBannerButton(renderLayout(true));

      expect(button.props.target).toBe('bearbell-stop');
      expect(button.props.label).toBe(COPY.stopLabel);
    });

    it('켜짐 + stale 이어도 bearbell-stop 끄기 버튼이다', () => {
      const button = getBannerButton(renderLayout(true, createEnvironment({ isStale: true })));

      expect(button.props.target).toBe('bearbell-stop');
    });

    it('꺼짐이면 bearbell-start 켜기 버튼이다', () => {
      const button = getBannerButton(renderLayout(false));

      expect(button.props.target).toBe('bearbell-start');
      expect(button.props.label).toBe(COPY.startLabel);
    });
  });
});
