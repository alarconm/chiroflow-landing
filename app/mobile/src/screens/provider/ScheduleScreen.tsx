import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useTheme, BRAND_COLORS } from '../../contexts/ThemeContext';
import { useOffline } from '../../contexts/OfflineContext';

export function ScheduleScreen() {
  const { colors } = useTheme();
  const { isOnline, syncStatus } = useOffline();
  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    // In a real app, this would fetch schedule data
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setRefreshing(false);
  }, []);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={BRAND_COLORS.primary}
        />
      }
    >
      {/* Offline indicator */}
      {!isOnline && (
        <View style={[styles.offlineBanner, { backgroundColor: colors.warning }]}>
          <Text style={styles.offlineBannerText}>Offline Mode - Changes will sync when connected</Text>
        </View>
      )}

      {/* Today's summary card */}
      <View style={[styles.summaryCard, { backgroundColor: BRAND_COLORS.primary }]}>
        <Text style={styles.summaryDate}>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
        <View style={styles.summaryStats}>
          <View style={styles.summaryStatItem}>
            <Text style={styles.summaryStatValue}>12</Text>
            <Text style={styles.summaryStatLabel}>Appointments</Text>
          </View>
          <View style={styles.summaryStatItem}>
            <Text style={styles.summaryStatValue}>3</Text>
            <Text style={styles.summaryStatLabel}>Checked In</Text>
          </View>
          <View style={styles.summaryStatItem}>
            <Text style={styles.summaryStatValue}>2</Text>
            <Text style={styles.summaryStatLabel}>Completed</Text>
          </View>
        </View>
      </View>

      {/* Next appointment */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Next Appointment</Text>
        <View style={[styles.appointmentCard, { borderColor: colors.border }]}>
          <View style={styles.appointmentTime}>
            <Text style={[styles.appointmentTimeText, { color: BRAND_COLORS.primary }]}>10:30 AM</Text>
          </View>
          <View style={styles.appointmentDetails}>
            <Text style={[styles.patientName, { color: colors.text }]}>John Smith</Text>
            <Text style={[styles.appointmentType, { color: colors.textSecondary }]}>
              Follow-up Adjustment
            </Text>
            <Text style={[styles.appointmentDuration, { color: colors.textMuted }]}>30 minutes</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: colors.success + '20' }]}>
            <Text style={[styles.statusBadgeText, { color: colors.success }]}>Confirmed</Text>
          </View>
        </View>
      </View>

      {/* Upcoming appointments */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Upcoming</Text>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[styles.appointmentCard, { borderColor: colors.border }]}
          >
            <View style={styles.appointmentTime}>
              <Text style={[styles.appointmentTimeText, { color: BRAND_COLORS.primary }]}>
                {`${10 + i}:${i % 2 === 0 ? '00' : '30'} AM`}
              </Text>
            </View>
            <View style={styles.appointmentDetails}>
              <Text style={[styles.patientName, { color: colors.text }]}>
                Patient {i}
              </Text>
              <Text style={[styles.appointmentType, { color: colors.textSecondary }]}>
                {i % 2 === 0 ? 'New Patient Exam' : 'Adjustment'}
              </Text>
            </View>
          </View>
        ))}
      </View>
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
  offlineBanner: {
    padding: 8,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  summaryCard: {
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  summaryDate: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStatItem: {
    alignItems: 'center',
  },
  summaryStatValue: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  summaryStatLabel: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  appointmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  appointmentTime: {
    width: 80,
  },
  appointmentTimeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  appointmentDetails: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: '500',
  },
  appointmentType: {
    fontSize: 14,
    marginTop: 2,
  },
  appointmentDuration: {
    fontSize: 12,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
