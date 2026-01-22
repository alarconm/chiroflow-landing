import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../contexts/AuthContext';
import { useTheme, BRAND_COLORS } from '../contexts/ThemeContext';

// Placeholder screens - these would be implemented fully in a real app
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ScheduleScreen } from '../screens/provider/ScheduleScreen';
import { PatientsScreen } from '../screens/provider/PatientsScreen';
import { ChartingScreen } from '../screens/provider/ChartingScreen';
import { SettingsScreen } from '../screens/shared/SettingsScreen';
import { AppointmentsScreen } from '../screens/patient/AppointmentsScreen';
import { HealthScreen } from '../screens/patient/HealthScreen';
import { MessagesScreen } from '../screens/shared/MessagesScreen';

// Type definitions
export type RootStackParamList = {
  Auth: undefined;
  ProviderTabs: undefined;
  PatientTabs: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
};

export type ProviderTabParamList = {
  Schedule: undefined;
  Patients: undefined;
  Charting: undefined;
  Messages: undefined;
  Settings: undefined;
};

export type PatientTabParamList = {
  Appointments: undefined;
  Health: undefined;
  Messages: undefined;
  Settings: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const ProviderTabs = createBottomTabNavigator<ProviderTabParamList>();
const PatientTabs = createBottomTabNavigator<PatientTabParamList>();

// Auth navigator
function AuthNavigator() {
  const { colors } = useTheme();

  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

// Provider tab navigator
function ProviderTabNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <ProviderTabs.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'help-outline';

          switch (route.name) {
            case 'Schedule':
              iconName = focused ? 'calendar' : 'calendar-outline';
              break;
            case 'Patients':
              iconName = focused ? 'people' : 'people-outline';
              break;
            case 'Charting':
              iconName = focused ? 'document-text' : 'document-text-outline';
              break;
            case 'Messages':
              iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
              break;
            case 'Settings':
              iconName = focused ? 'settings' : 'settings-outline';
              break;
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: BRAND_COLORS.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: BRAND_COLORS.primary,
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: '600',
        },
      })}
    >
      <ProviderTabs.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{ title: 'Schedule' }}
      />
      <ProviderTabs.Screen
        name="Patients"
        component={PatientsScreen}
        options={{ title: 'Patients' }}
      />
      <ProviderTabs.Screen
        name="Charting"
        component={ChartingScreen}
        options={{ title: 'Charting' }}
      />
      <ProviderTabs.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ title: 'Messages' }}
      />
      <ProviderTabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </ProviderTabs.Navigator>
  );
}

// Patient tab navigator
function PatientTabNavigator() {
  const { colors } = useTheme();

  return (
    <PatientTabs.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = 'help-outline';

          switch (route.name) {
            case 'Appointments':
              iconName = focused ? 'calendar' : 'calendar-outline';
              break;
            case 'Health':
              iconName = focused ? 'heart' : 'heart-outline';
              break;
            case 'Messages':
              iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
              break;
            case 'Settings':
              iconName = focused ? 'settings' : 'settings-outline';
              break;
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: BRAND_COLORS.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: BRAND_COLORS.primary,
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: '600',
        },
      })}
    >
      <PatientTabs.Screen
        name="Appointments"
        component={AppointmentsScreen}
        options={{ title: 'Appointments' }}
      />
      <PatientTabs.Screen
        name="Health"
        component={HealthScreen}
        options={{ title: 'My Health' }}
      />
      <PatientTabs.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ title: 'Messages' }}
      />
      <PatientTabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </PatientTabs.Navigator>
  );
}

// Main root navigator
export function RootNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { colors, isDark } = useTheme();

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={BRAND_COLORS.primary} />
      </View>
    );
  }

  // Custom navigation theme
  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: BRAND_COLORS.primary,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      notification: BRAND_COLORS.accent,
    },
  };

  // Determine if user is a provider or patient
  const isProvider = user?.role === 'PROVIDER' || user?.role === 'ADMIN' || user?.role === 'STAFF';

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          isProvider ? (
            <RootStack.Screen name="ProviderTabs" component={ProviderTabNavigator} />
          ) : (
            <RootStack.Screen name="PatientTabs" component={PatientTabNavigator} />
          )
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
