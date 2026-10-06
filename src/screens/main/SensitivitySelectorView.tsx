import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Sensitivity } from '../../../modules/bearbell-engine/src/Sensitivity';
import { COLORS } from '../../theme/Colors';
import { FONTS } from '../../theme/Fonts';

type Props = {
  value: Sensitivity;
  title: string;
  labels: Record<Sensitivity, string>;
  onSelect: (sensitivity: Sensitivity) => void;
};

const SENSITIVITY_OPTIONS = [Sensitivity.High, Sensitivity.Mid, Sensitivity.Low] as const;

const SensitivitySelectorView = ({ value, title, labels, onSelect }: Props) => (
  <View style={styles.container}>
    <Text style={styles.label}>{title}</Text>
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={title}>
      {SENSITIVITY_OPTIONS.map((option) => {
        const isChecked = option === value;
        const label = labels[option];

        return (
          <Pressable
            key={option}
            style={[styles.segment, isChecked && styles.segmentChecked]}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: isChecked }}
            onPress={() => onSelect(option)}
          >
            <Text style={[styles.segmentText, isChecked && styles.segmentTextChecked]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    letterSpacing: 0.5,
    color: COLORS.muted,
  },
  track: {
    flexDirection: 'row',
    gap: 6,
    padding: 5,
    borderRadius: 16,
    backgroundColor: COLORS.segTrack,
  },
  segment: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  segmentChecked: {
    backgroundColor: COLORS.ink,
  },
  segmentText: {
    fontFamily: FONTS.medium,
    fontSize: 15,
    color: COLORS.segInactiveText,
  },
  segmentTextChecked: {
    fontFamily: FONTS.semiBold,
    color: COLORS.background,
  },
});

export default SensitivitySelectorView;
