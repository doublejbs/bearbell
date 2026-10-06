import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import useTranslation from '../../i18n/useTranslation';
import { COLORS } from '../../theme/Colors';
import { FONTS } from '../../theme/Fonts';
import BearBellView from './BearBellView';
import PowerButtonView from './PowerButtonView';
import SensitivitySelectorView from './SensitivitySelectorView';
import StatusTextView from './StatusTextView';
import useMainScreenState from './useMainScreenState';

const MIN_PADDING_TOP = 64;
const MIN_PADDING_BOTTOM = 40;
const SAFE_AREA_EXTRA = 16;

const MainScreen = () => {
  const insets = useSafeAreaInsets();
  const translation = useTranslation();
  const {
    isArmed,
    isToggling,
    sensitivity,
    ringToken,
    handleToggle,
    handleSelectSensitivity,
    handleRing,
  } = useMainScreenState();

  const safeAreaPadding = {
    paddingTop: Math.max(MIN_PADDING_TOP, insets.top + SAFE_AREA_EXTRA),
    paddingBottom: Math.max(MIN_PADDING_BOTTOM, insets.bottom + SAFE_AREA_EXTRA),
  };

  const statusTitle = isArmed ? translation.status.armedTitle : translation.status.pausedTitle;
  const statusSub = isArmed ? translation.status.armedSubtitle : translation.status.pausedSubtitle;
  const powerLabel = isArmed ? translation.power.turnOff : translation.power.turnOn;

  return (
    <View style={[styles.container, safeAreaPadding]}>
      <StatusBar style="dark" />
      <Text style={styles.title}>bearbell</Text>
      <View style={styles.middle}>
        <BearBellView
          isArmed={isArmed}
          ringToken={ringToken}
          accessibilityLabel={translation.bell.accessibilityLabel}
          onPress={handleRing}
        />
        <StatusTextView title={statusTitle} sub={statusSub} />
      </View>
      <SensitivitySelectorView
        value={sensitivity}
        title={translation.sensitivity.title}
        labels={translation.sensitivity.labels}
        onSelect={handleSelectSensitivity}
      />
      <PowerButtonView
        isArmed={isArmed}
        isDisabled={isToggling}
        label={powerLabel}
        onPress={handleToggle}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 28,
    paddingHorizontal: 24,
    backgroundColor: COLORS.background,
  },
  title: {
    fontFamily: FONTS.titleBold,
    fontSize: 30,
    letterSpacing: -0.5,
    color: COLORS.ink,
    textAlign: 'center',
  },
  middle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
  },
});

export default MainScreen;
