import { Button, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  monospacedDigit,
  padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

// 위젯 런타임은 번역 모듈을 참조할 수 없으므로 컨트롤러가 호출 시점의 기기 언어로 완성한 문구를 넘긴다 (docs/Spec.md §10)
export type BearbellLiveActivityCopy = {
  armedTitle: string;
  armedDetail: string;
  offTitle: string;
  offDetail: string;
  staleTitle: string;
  staleDetail: string;
  compactOff: string;
  compactStale: string;
  stopLabel: string;
  startLabel: string;
};

export type BearbellLiveActivityProps = {
  copy: BearbellLiveActivityCopy;
  sensitivityLabel: string;
  startedAtMs: number;
  isArmed: boolean;
};

// 'widget' 컴포넌트는 격리 런타임에서 함수 본문만 직렬화되어 실행되므로
// 색 등 모든 값은 함수 안에 선언하고 문구는 props.copy 로만 받는다 (모듈 스코프 상수 참조 불가, docs/Spec.md §2.1·§10)
const BearbellActivity = (props: BearbellLiveActivityProps, environment: LiveActivityEnvironment) => {
  'widget';

  const inkColor = '#1B2620';
  const ivoryColor = '#F2EDE1';
  const mutedColor = '#9AA39B';
  const accentColor = environment.isLuminanceReduced ? '#F2EDE1' : '#B8862B';
  const copy = props.copy;
  const isArmed = props.isArmed;
  // 버튼은 네이티브 BellEngine 이 target 으로 구분해 켜고 끈다 — 켜짐은 끄기, 꺼짐은 켜기 (docs/Spec.md §2.1)
  const buttonTarget = isArmed ? 'bearbell-stop' : 'bearbell-start';
  // 갱신이 끊겨 stale 이 되면 켜짐을 단정하지 않고 확인을 안내한다 — 꺼짐은 앱이 죽어도 사실이므로 켜짐에만 적용 (docs/Spec.md §2.1)
  const isStale = isArmed && environment.isStale;
  const isTimerVisible = isArmed && !isStale;
  const waveColor = isTimerVisible ? accentColor : mutedColor;
  const armedTitleText = isStale ? copy.staleTitle : copy.armedTitle;
  const armedDetailText = isStale ? copy.staleDetail : copy.armedDetail;
  const titleText = isArmed ? armedTitleText : copy.offTitle;
  const detailText = isArmed ? armedDetailText : copy.offDetail;
  // 타이머가 없을 때(stale 켜짐 또는 꺼짐)의 compactTrailing 문구
  const trailingText = isArmed ? copy.compactStale : copy.compactOff;
  const buttonLabel = isArmed ? copy.stopLabel : copy.startLabel;
  const buttonTint = isArmed ? mutedColor : accentColor;
  const startedAt = new Date(props.startedAtMs);

  return {
    banner: (
      <HStack
        spacing={12}
        modifiers={[padding({ all: 16 }), activityBackgroundTint(inkColor)]}
      >
        <Image systemName="pawprint.fill" size={28} color={waveColor} />
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ weight: 'semibold', size: 17 }), foregroundStyle(ivoryColor)]}>
            {titleText}
          </Text>
          <Text modifiers={[font({ size: 14 }), foregroundStyle(ivoryColor)]}>{detailText}</Text>
        </VStack>
        <Spacer />
        {isTimerVisible ? (
          <Text
            date={startedAt}
            dateStyle="timer"
            modifiers={[
              font({ weight: 'medium', size: 15 }),
              monospacedDigit(),
              foregroundStyle(waveColor),
              frame({ maxWidth: 72, alignment: 'trailing' }),
            ]}
          />
        ) : null}
        <Button
          target={buttonTarget}
          label={buttonLabel}
          modifiers={[buttonStyle('bordered'), tint(buttonTint)]}
        />
      </HStack>
    ),
    compactLeading: <Image systemName="pawprint.fill" color={waveColor} />,
    compactTrailing: isTimerVisible ? (
      <Text
        date={startedAt}
        dateStyle="timer"
        modifiers={[
          monospacedDigit(),
          foregroundStyle(waveColor),
          frame({ maxWidth: 48, alignment: 'trailing' }),
        ]}
      />
    ) : (
      <Text modifiers={[foregroundStyle(waveColor)]}>{trailingText}</Text>
    ),
    minimal: <Image systemName="pawprint.fill" color={waveColor} />,
    expandedLeading: (
      <Image
        systemName="pawprint.fill"
        size={24}
        color={waveColor}
        modifiers={[padding({ leading: 8 })]}
      />
    ),
    expandedCenter: (
      <Text modifiers={[font({ weight: 'semibold', size: 16 }), foregroundStyle(ivoryColor)]}>
        {titleText}
      </Text>
    ),
    expandedBottom: (
      <HStack spacing={12}>
        <Text modifiers={[font({ size: 14 }), foregroundStyle(ivoryColor)]}>{detailText}</Text>
        <Spacer />
        <Button
          target={buttonTarget}
          label={buttonLabel}
          modifiers={[buttonStyle('bordered'), tint(buttonTint)]}
        />
      </HStack>
    ),
  };
};

export default createLiveActivity<BearbellLiveActivityProps>('BearbellActivity', BearbellActivity);
