# Firebase App Distribution Guide

## Overview

Firebase App Distribution provides a way to distribute pre-release builds to testers, with support for both iOS and Android. It's particularly useful for Android beta testing outside the Play Store.

## Setup

### Prerequisites
- [ ] Firebase project created
- [ ] Firebase CLI installed (`npm install -g firebase-tools`)
- [ ] Firebase configuration files added to project

### Firebase Project Setup

1. **Create Firebase Project**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create new project "ChiroFlow"
   - Enable Google Analytics (optional)

2. **Add Apps**
   - Add iOS app: `com.chiroflow.app`
   - Add Android app: `com.chiroflow.app`
   - Download config files

### Configuration Files

**iOS (GoogleService-Info.plist)**
Place in `ios/ChiroFlow/` directory

**Android (google-services.json)**
Place in `android/app/` directory

Update `app.json`:
```json
{
  "expo": {
    "android": {
      "googleServicesFile": "./google-services.json"
    },
    "ios": {
      "googleServicesFile": "./GoogleService-Info.plist"
    }
  }
}
```

## Firebase CLI Setup

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize project
firebase init

# Select:
# - App Distribution
# - Use existing project
# - Select ChiroFlow project
```

## Tester Management

### Create Tester Groups

In Firebase Console > App Distribution > Testers & Groups:

| Group Name | Purpose | Access Level |
|------------|---------|--------------|
| internal | Development team | All builds |
| staff | Practice staff testers | Beta builds |
| external | External beta testers | Stable betas |
| vip | Key customers | Pre-release |

### Add Testers
```bash
# Add individual tester
firebase appdistribution:testers:add beta@chiroflow.com

# Add testers from file
firebase appdistribution:testers:add --file testers.txt

# Remove tester
firebase appdistribution:testers:remove oldtester@example.com
```

**testers.txt format:**
```
tester1@example.com
tester2@example.com
tester3@example.com
```

## Build Distribution

### Distribute Android Build
```bash
# Build APK
eas build --platform android --profile preview --local

# Or using Gradle
cd android && ./gradlew assembleRelease

# Distribute
firebase appdistribution:distribute android/app/build/outputs/apk/release/app-release.apk \
  --app YOUR_FIREBASE_APP_ID \
  --groups "internal,staff" \
  --release-notes "Version 1.0.0 Beta 1

New features:
- Patient appointment booking
- Offline schedule viewing
- Push notifications

Bug fixes:
- Fixed calendar sync issue
- Improved login reliability"
```

### Distribute iOS Build
```bash
# Build IPA (requires Mac)
eas build --platform ios --profile preview --local

# Distribute
firebase appdistribution:distribute ChiroFlow.ipa \
  --app YOUR_FIREBASE_IOS_APP_ID \
  --groups "internal" \
  --release-notes "iOS Beta Build"
```

### Using npm Scripts
Add to `package.json`:
```json
{
  "scripts": {
    "distribute:android": "firebase appdistribution:distribute android/app/build/outputs/apk/release/app-release.apk --app $FIREBASE_ANDROID_APP_ID --groups internal",
    "distribute:ios": "firebase appdistribution:distribute ChiroFlow.ipa --app $FIREBASE_IOS_APP_ID --groups internal"
  }
}
```

## CI/CD Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/beta-distribution.yml
name: Beta Distribution

on:
  push:
    branches: [beta]
  workflow_dispatch:

jobs:
  distribute-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Setup EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: Build Android
        run: eas build --platform android --profile preview --non-interactive

      - name: Download artifact
        run: eas build:list --platform android --status finished --limit 1 --json | jq -r '.[0].artifacts.buildUrl' | xargs curl -L -o app-release.apk

      - name: Distribute to Firebase
        uses: wzieba/Firebase-Distribution-Github-Action@v1
        with:
          appId: ${{ secrets.FIREBASE_ANDROID_APP_ID }}
          serviceCredentialsFileContent: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          groups: internal
          file: app-release.apk
          releaseNotes: |
            Automated beta build from commit ${{ github.sha }}

            Changes:
            ${{ github.event.head_commit.message }}
```

## In-App Update Prompts

### Check for Updates
```typescript
// src/services/updateChecker.ts
import * as Application from 'expo-application';

interface LatestRelease {
  version: string;
  downloadUrl: string;
  releaseNotes: string;
}

export const checkForBetaUpdate = async (): Promise<LatestRelease | null> => {
  try {
    const response = await fetch(
      `https://firebaseappdistribution.googleapis.com/v1/projects/YOUR_PROJECT/apps/YOUR_APP_ID/releases?pageSize=1`,
      {
        headers: {
          Authorization: `Bearer ${await getFirebaseToken()}`,
        },
      }
    );

    const data = await response.json();
    const latestRelease = data.releases?.[0];

    if (!latestRelease) return null;

    const currentVersion = Application.nativeApplicationVersion;
    if (latestRelease.displayVersion !== currentVersion) {
      return {
        version: latestRelease.displayVersion,
        downloadUrl: latestRelease.firebaseConsoleUri,
        releaseNotes: latestRelease.releaseNotes?.text || '',
      };
    }

    return null;
  } catch (error) {
    console.error('Failed to check for updates:', error);
    return null;
  }
};
```

### Update Prompt UI
```typescript
// src/components/UpdatePrompt.tsx
import { Alert, Linking } from 'react-native';

export const showUpdatePrompt = (release: LatestRelease) => {
  Alert.alert(
    'Update Available',
    `Version ${release.version} is available.\n\n${release.releaseNotes}`,
    [
      { text: 'Later', style: 'cancel' },
      {
        text: 'Update',
        onPress: () => Linking.openURL(release.downloadUrl),
      },
    ]
  );
};
```

## Feedback Collection

### Firebase Crashlytics Integration
```typescript
// src/services/crashlytics.ts
import crashlytics from '@react-native-firebase/crashlytics';

export const initCrashlytics = async () => {
  await crashlytics().setCrashlyticsCollectionEnabled(true);
};

export const logBetaFeedback = async (feedback: string) => {
  crashlytics().log(`Beta Feedback: ${feedback}`);
};

export const setTesterInfo = async (email: string) => {
  await crashlytics().setUserId(email);
  await crashlytics().setAttribute('tester_group', 'beta');
};
```

### In-App Feedback Form
```typescript
// src/components/BetaFeedback.tsx
import { useState } from 'react';
import { View, TextInput, Button, StyleSheet } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

export const BetaFeedbackForm = () => {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitFeedback = async () => {
    setSubmitting(true);
    try {
      await fetch('https://api.chiroflow.com/beta/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedback,
          device: Device.modelName,
          os: `${Device.osName} ${Device.osVersion}`,
          appVersion: Constants.expoConfig?.version,
          buildNumber: Constants.expoConfig?.ios?.buildNumber ||
                       Constants.expoConfig?.android?.versionCode,
          timestamp: new Date().toISOString(),
        }),
      });
      setFeedback('');
      Alert.alert('Thank you!', 'Your feedback has been submitted.');
    } catch (error) {
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Describe your feedback..."
        value={feedback}
        onChangeText={setFeedback}
        multiline
        numberOfLines={4}
      />
      <Button
        title={submitting ? 'Submitting...' : 'Submit Feedback'}
        onPress={submitFeedback}
        disabled={submitting || !feedback.trim()}
      />
    </View>
  );
};
```

## Release Notes Template

```markdown
# ChiroFlow Beta v{VERSION} ({BUILD})

## Release Date
{DATE}

## What's New
- Feature: {description}
- Feature: {description}

## Improvements
- Improved {area}: {description}
- Optimized {area}: {description}

## Bug Fixes
- Fixed {issue}
- Fixed {issue}

## Known Issues
- {Issue description} - Workaround: {workaround}

## Testing Focus
Please focus testing on:
1. {Feature to test}
2. {Feature to test}
3. {Workflow to test}

## Feedback
Report issues at: beta-feedback@chiroflow.com
Or use in-app feedback button in Settings > Beta Feedback
```

## Metrics & Analytics

### Track via Firebase Analytics
```typescript
import analytics from '@react-native-firebase/analytics';

// Track beta-specific events
await analytics().logEvent('beta_feature_used', {
  feature_name: 'appointment_booking',
  build_number: Constants.expoConfig?.android?.versionCode,
});

await analytics().setUserProperty('beta_tester', 'true');
await analytics().setUserProperty('tester_group', 'external');
```

### Monitor in Firebase Console
- App Distribution > Release Dashboard
- Crashlytics > Issues
- Analytics > Events
