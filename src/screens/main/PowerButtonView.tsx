import { Pressable, StyleSheet, Text } from 'react-native';

import { COLORS } from '../../theme/Colors';
import { FONTS } from '../../theme/Fonts';

type Props = {
  isArmed: boolean;
  isDisabled: boolean;
  label: string;
  onPress: () => void;
};

const PowerButtonView = ({ isArmed, isDisabled, label, onPress }: Props) => (
  <Pressable
    style={[
      styles.button,
      isArmed ? styles.buttonArmed : styles.buttonIdle,
      isDisabled && styles.buttonDisabled,
    ]}
    accessibilityRole="button"
    accessibilityState={{ selected: isArmed, disabled: isDisabled }}
    disabled={isDisabled}
    onPress={onPress}
  >
    <Text style={[styles.label, isArmed ? styles.labelArmed : styles.labelIdle]}>
      {label}
    </Text>
  </Pressable>
);

const styles = StyleSheet.create({
  button: {
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonIdle: {
    backgroundColor: COLORS.ink,
  },
  buttonArmed: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  label: {
    fontFamily: FONTS.semiBold,
    fontSize: 17,
  },
  labelIdle: {
    color: COLORS.background,
  },
  labelArmed: {
    color: COLORS.ink,
  },
});

export default PowerButtonView;
