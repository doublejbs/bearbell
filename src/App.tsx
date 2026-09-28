import { GowunBatang_700Bold } from '@expo-google-fonts/gowun-batang';
import {
  IBMPlexSansKR_400Regular,
  IBMPlexSansKR_500Medium,
  IBMPlexSansKR_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans-kr';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MainScreen from './screens/main/MainScreen';
import { COLORS } from './theme/Colors';
import { FONTS } from './theme/Fonts';

const FONT_MAP = {
  [FONTS.titleBold]: GowunBatang_700Bold,
  [FONTS.regular]: IBMPlexSansKR_400Regular,
  [FONTS.medium]: IBMPlexSansKR_500Medium,
  [FONTS.semiBold]: IBMPlexSansKR_600SemiBold,
};

void SplashScreen.preventAutoHideAsync();

const App = () => {
  const [isFontLoaded, fontError] = useFonts(FONT_MAP);

  const isReady = isFontLoaded || fontError !== null;

  useEffect(() => {
    const hideSplash = async () => {
      try {
        await SplashScreen.hideAsync();
      } catch {
        console.warn('Failed to hide splash screen');
      }
    };

    if (isReady) {
      void hideSplash();
    }
  }, [isReady]);

  if (!isReady) {
    return <View style={styles.placeholder} />;
  }

  return (
    <SafeAreaProvider>
      <MainScreen />
    </SafeAreaProvider>
  );
};

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});

export default App;
