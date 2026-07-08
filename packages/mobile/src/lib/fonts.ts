import {
  useFonts,
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_600SemiBold,
} from '@expo-google-fonts/newsreader';
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
} from '@expo-google-fonts/jetbrains-mono';

// Loads the three editorial families the app uses. Returns [loaded, error].
export function useAppFonts() {
  return useFonts({
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_600SemiBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
}
