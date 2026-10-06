import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { COLORS } from '../../theme/Colors';

type Props = {
  isArmed: boolean;
  ringToken: number;
  accessibilityLabel: string;
  onPress: () => void;
};

const BELL_WIDTH = 280;
const BELL_HEIGHT = 300;
const VIEW_BOX = `0 0 ${BELL_WIDTH} ${BELL_HEIGHT}`;

const WAVE_LOOP_DURATION_MS = 2400;
const WAVE_RING_DURATION_MS = 900;
const WAVE_PEAK_AT = 0.35;
const WAVE_PEAK_OPACITY = 0.85;
const WAVE_SCALE_FROM = 0.9;
const WAVE_SCALE_TO = 1.18;
const EASING_SAMPLE_COUNT = 12;

// CSS ease-out 과 동일한 곡선
const EASE_OUT = Easing.bezier(0, 0, 0.58, 1);

const WAVE_PATHS = [
  'M34 130 Q16 170 34 210',
  'M14 118 Q-8 170 14 222',
  'M246 130 Q264 170 246 210',
  'M266 118 Q288 170 266 222',
];

type Keyframe = [progress: number, value: number];

// 네이티브 드라이버는 interpolate easing 을 지원하지 않으므로 키프레임 구간별 곡선을 샘플링한다
const buildEasedRange = (keyframes: Keyframe[]) => {
  const inputRange: number[] = [keyframes[0][0]];
  const outputRange: number[] = [keyframes[0][1]];

  for (let index = 1; index < keyframes.length; index += 1) {
    const [fromProgress, fromValue] = keyframes[index - 1];
    const [toProgress, toValue] = keyframes[index];

    for (let step = 1; step <= EASING_SAMPLE_COUNT; step += 1) {
      const ratio = step / EASING_SAMPLE_COUNT;

      inputRange.push(fromProgress + (toProgress - fromProgress) * ratio);
      outputRange.push(fromValue + (toValue - fromValue) * EASE_OUT(ratio));
    }
  }

  return { inputRange, outputRange };
};

const OPACITY_RANGE = buildEasedRange([
  [0, 0],
  [WAVE_PEAK_AT, WAVE_PEAK_OPACITY],
  [1, 0],
]);

const SCALE_RANGE = buildEasedRange([
  [0, WAVE_SCALE_FROM],
  [1, WAVE_SCALE_TO],
]);

const createWaveTiming = (progress: Animated.Value, duration: number) =>
  Animated.timing(progress, {
    toValue: 1,
    duration,
    easing: Easing.linear,
    useNativeDriver: true,
  });

const BearBellView = ({ isArmed, ringToken, accessibilityLabel, onPress }: Props) => {
  const [progress] = useState(() => new Animated.Value(0));
  const lastRingTokenRef = useRef(ringToken);

  useEffect(() => {
    const isRing = ringToken !== lastRingTokenRef.current;

    lastRingTokenRef.current = ringToken;
    progress.setValue(0);

    if (!isArmed) {
      return undefined;
    }

    let activeAnimation: Animated.CompositeAnimation;

    const startLoop = () => {
      progress.setValue(0);
      activeAnimation = Animated.loop(createWaveTiming(progress, WAVE_LOOP_DURATION_MS));
      activeAnimation.start();
    };

    if (isRing) {
      activeAnimation = createWaveTiming(progress, WAVE_RING_DURATION_MS);
      activeAnimation.start(({ finished }) => {
        if (finished) {
          startLoop();
        }
      });
    } else {
      startLoop();
    }

    return () => {
      activeAnimation.stop();
    };
  }, [isArmed, ringToken, progress]);

  const waveStyle = useMemo(
    () => ({
      opacity: progress.interpolate(OPACITY_RANGE),
      transform: [{ scale: progress.interpolate(SCALE_RANGE) }],
    }),
    [progress],
  );

  return (
    <Pressable
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
    >
      {/* 디자인처럼 280×300 영역 밖으로 커진 음파는 잘라낸다 */}
      <View
        pointerEvents="none"
        style={styles.waveClip}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[styles.waves, waveStyle]}>
          <Svg viewBox={VIEW_BOX} width={BELL_WIDTH} height={BELL_HEIGHT}>
            <G fill="none" stroke={COLORS.wave} strokeWidth={3} strokeLinecap="round">
              {WAVE_PATHS.map((d) => (
                <Path key={d} d={d} />
              ))}
            </G>
          </Svg>
        </Animated.View>
      </View>
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg viewBox={VIEW_BOX} width={BELL_WIDTH} height={BELL_HEIGHT}>
          <G>
            <Circle cx={82} cy={98} r={28} fill={COLORS.bear} />
            <Circle cx={198} cy={98} r={28} fill={COLORS.bear} />
            <Path
              d="M140 68 C 86 68 54 106 54 156 C 54 210 90 248 140 250 C 190 248 226 210 226 156 C 226 106 194 68 140 68 Z"
              fill={COLORS.bear}
            />
            <Circle cx={112} cy={144} r={8} fill={COLORS.eye} />
            <Circle cx={168} cy={144} r={8} fill={COLORS.eye} />
            <Circle cx={114.5} cy={141.5} r={2.4} fill={COLORS.eyeHighlight} />
            <Circle cx={170.5} cy={141.5} r={2.4} fill={COLORS.eyeHighlight} />
            <Ellipse cx={140} cy={190} rx={32} ry={26} fill={COLORS.muzzle} />
            <Path
              d="M127 180 C 127 172 153 172 153 180 C 153 188 146 193 140 194 C 134 193 127 188 127 180 Z"
              fill={COLORS.nose}
            />
            <Path d="M140 194 L140 206" stroke={COLORS.nose} strokeWidth={3.5} strokeLinecap="round" />
          </G>
        </Svg>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    width: BELL_WIDTH,
    height: BELL_HEIGHT,
    borderRadius: 24,
  },
  waveClip: {
    ...StyleSheet.absoluteFill,
    width: BELL_WIDTH,
    height: BELL_HEIGHT,
    overflow: 'hidden',
  },
  waves: {
    width: BELL_WIDTH,
    height: BELL_HEIGHT,
  },
});

export default BearBellView;
