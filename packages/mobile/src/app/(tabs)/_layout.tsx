import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { font, useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const router = useRouter();
  const { session, loading } = useAuth();

  if (!loading && !session) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.green,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopColor: t.border,
          height: 84,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: font.sansMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="meal-plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ color }) => (
            <View style={{ marginTop: 2 }}>
              <Ionicons name="add-circle" size={30} color={color} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            router.push('/new-recipe');
          },
        }}
      />
      <Tabs.Screen
        name="cookbooks"
        options={{
          title: 'Cookbook',
          tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
