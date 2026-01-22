import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme, BRAND_COLORS } from '../../contexts/ThemeContext';
import { useOffline } from '../../contexts/OfflineContext';

export function SettingsScreen() {
  const { user, logout } = useAuth();
  const { colors, isDark, mode, setMode } = useTheme();
  const { isOnline, pendingOperations, syncStatus, triggerSync } = useOffline();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const toggleDarkMode = () => {
    setMode(isDark ? 'light' : 'dark');
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* User Profile Section */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <View style={styles.profileHeader}>
          <View style={[styles.avatar, { backgroundColor: BRAND_COLORS.primary }]}>
            <Text style={styles.avatarText}>
              {user?.firstName?.[0] || 'U'}
              {user?.lastName?.[0] || ''}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: colors.text }]}>
              {user?.firstName || 'User'} {user?.lastName || ''}
            </Text>
            <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
              {user?.email || 'user@example.com'}
            </Text>
            <Text style={[styles.profileOrg, { color: colors.textMuted }]}>
              {user?.organizationName || 'Organization'}
            </Text>
          </View>
        </View>
      </View>

      {/* Sync Status */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sync Status</Text>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons
              name={isOnline ? 'cloud-done' : 'cloud-offline'}
              size={24}
              color={isOnline ? colors.success : colors.warning}
            />
            <Text style={[styles.settingLabel, { color: colors.text }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
          <Text style={[styles.settingValue, { color: colors.textSecondary }]}>
            {pendingOperations} pending
          </Text>
        </View>
        {pendingOperations > 0 && isOnline && (
          <TouchableOpacity
            style={[styles.syncButton, { backgroundColor: BRAND_COLORS.primary }]}
            onPress={triggerSync}
            disabled={syncStatus === 'syncing'}
          >
            <Text style={styles.syncButtonText}>
              {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Preferences */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferences</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={24} color={colors.text} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleDarkMode}
            trackColor={{ false: colors.border, true: BRAND_COLORS.primary }}
            thumbColor="#ffffff"
          />
        </View>

        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Notifications</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name="finger-print-outline" size={24} color={colors.text} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Biometric Login</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Support */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Support</Text>

        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name="help-circle-outline" size={24} color={colors.text} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Help Center</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name="chatbubble-outline" size={24} color={colors.text} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Beta Feedback</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name="document-text-outline" size={24} color={colors.text} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Privacy Policy</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Ionicons name="shield-outline" size={24} color={colors.text} />
            <Text style={[styles.settingLabel, { color: colors.text }]}>Terms of Service</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Sign Out */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color={BRAND_COLORS.accent} />
          <Text style={[styles.logoutText, { color: BRAND_COLORS.accent }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* Version Info */}
      <Text style={[styles.versionText, { color: colors.textMuted }]}>
        ChiroFlow v1.0.0 (Build 1)
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
  },
  profileEmail: {
    fontSize: 14,
    marginTop: 2,
  },
  profileOrg: {
    fontSize: 12,
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingLabel: {
    fontSize: 16,
    marginLeft: 12,
  },
  settingValue: {
    fontSize: 14,
  },
  syncButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  syncButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 8,
  },
});
