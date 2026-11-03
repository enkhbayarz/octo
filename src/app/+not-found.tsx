import { router } from 'expo-router';
import { View } from 'react-native';

import { Mascot } from '@/components/mascot';
import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, space } from '@/theme/tokens';

export default function NotFound() {
  const styles = useStyles();
  const colors = useColors();
  const t = useT();
  return (
    <View style={styles.screen}>
      <Mascot mood="sad" size={112} />
      <AppText variant="heading" align="center">
        {t.errors.notFoundTitle}
      </AppText>
      <AppText color={colors.inkSoft} align="center">
        {t.errors.notFoundBody}
      </AppText>
      <View style={styles.action}>
        <Button label={t.common.backHome} onPress={() => router.dismissTo('/')} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: gutter,
    backgroundColor: colors.paper,
  },
  action: {
    alignSelf: 'stretch',
    marginTop: space[6],
  },
}));
