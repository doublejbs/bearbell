import { StyleSheet, Text, View } from 'react-native';

import { COLORS } from '../../theme/Colors';
import { FONTS } from '../../theme/Fonts';

type Props = {
  title: string;
  sub: string;
};

const StatusTextView = ({ title, sub }: Props) => (
  <View style={styles.container}>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.sub}>{sub}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: FONTS.semiBold,
    fontSize: 22,
    color: COLORS.ink,
    textAlign: 'center',
  },
  sub: {
    fontFamily: FONTS.regular,
    fontSize: 15,
    color: COLORS.muted,
    textAlign: 'center',
  },
});

export default StatusTextView;
