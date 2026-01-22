# Google Play Store Deployment Guide

## Prerequisites

### Google Play Developer Account
1. Register for Google Play Developer account ($25 one-time)
2. Complete identity verification
3. Create Play Console developer profile

### Required Setup

#### Google Cloud Service Account
For automated uploads via EAS Submit:
1. Go to Google Cloud Console
2. Create a new project or select existing
3. Enable Google Play Android Developer API
4. Create Service Account with Editor role
5. Generate JSON key file
6. In Play Console > API access, link the service account

## Play Console Setup

### Create App
1. Log in to Google Play Console
2. Create app > Enter details:
   - App name: ChiroFlow
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free
3. Complete declarations (privacy policy, app access, ads, content rating)

### Store Listing

#### Main Store Listing
- **App name**: ChiroFlow (30 chars max)
- **Short description**: (80 chars max)
- **Full description**: (4000 chars max)

#### Graphics
- **App icon**: 512x512 PNG (32-bit, no alpha)
- **Feature graphic**: 1024x500 PNG or JPG
- **Phone screenshots**: Min 2, max 8 (16:9 or 9:16)
- **7-inch tablet screenshots**: Min 0, max 8
- **10-inch tablet screenshots**: Min 0, max 8

#### Categorization
- **Application type**: Application
- **Category**: Medical
- **Content rating**: Complete questionnaire
- **Target audience**: Users 18 and over

### App Content

#### Privacy Policy
- Add URL to hosted privacy policy
- Declare data safety (what data collected, shared, how secured)

#### Data Safety
Fill out the data safety form:
- Data collected (health, location, device ID)
- Data sharing practices
- Security practices (encryption, deletion policy)

#### App Access
- Provide test account credentials
- Explain restricted access areas

### Content Rating
Complete the IARC questionnaire:
- Violence: None
- Sexuality: None
- Language: None
- Controlled substance: None
- User interaction: Yes (messaging)
- Location sharing: Yes
- Data sharing: Yes

## App Signing

### Play App Signing (Recommended)
Let Google manage your app signing key:
1. Go to Release > Setup > App signing
2. Choose "Use Google-generated key"
3. Upload your upload key for verification

### Upload Key Setup
```bash
# Generate upload key
keytool -genkeypair -v -storetype PKCS12 -keystore upload-keystore.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000

# Export certificate
keytool -export -rfc -keystore upload-keystore.jks -alias upload -file upload-certificate.pem
```

### Key Management
- Store upload keystore securely (password manager, HSM)
- Never commit to source control
- Keep backup in secure location
- Document key passwords securely

## Build Configuration

### Gradle Signing Config
```groovy
// android/app/build.gradle
android {
    signingConfigs {
        release {
            storeFile file('upload-keystore.jks')
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias 'upload'
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

## Build and Submit

### Using EAS Build
```bash
# Build for Play Store
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android --profile production
```

### Manual Build
```bash
# Generate native project
npx expo prebuild --platform android

# Build release AAB
cd android
./gradlew bundleRelease

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

## Release Tracks

### Internal Testing (Up to 100 testers)
- Immediate availability
- No review required
- Use for development team

### Closed Testing (Alpha/Beta)
- Add testers via email lists or Google Groups
- Can create multiple closed tracks
- Requires short review (~hours)

### Open Testing (Beta)
- Public opt-in beta
- Listed on Play Store as "Early Access"
- Full review required

### Production
- Full public release
- Full review process
- Staged rollout available (1%, 5%, 10%, etc.)

## Firebase App Distribution (Alternative Beta)

### Setup
1. Create Firebase project
2. Add Android app with package name
3. Download google-services.json

### Distribution
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Distribute APK
firebase appdistribution:distribute app-release.apk \
  --app YOUR_FIREBASE_APP_ID \
  --groups "beta-testers" \
  --release-notes "Beta release notes"
```

## Review Guidelines Compliance

### Health App Requirements
- Clearly state app is for practice management
- Include medical disclaimer
- Protect PHI/health data

### Permission Requirements
- Request only necessary permissions
- Explain why each permission is needed
- Handle permission denials gracefully

### Privacy Requirements
- Valid privacy policy
- Complete data safety form
- Comply with GDPR, CCPA if applicable

### Technical Requirements
- Target recent Android SDK (API 34+)
- Support Android 8.0+ (API 26+)
- 64-bit support required
- No crashes or ANRs

## Post-Launch

### Android Vitals
Monitor in Play Console:
- Crash rate (target: <1.09%)
- ANR rate (target: <0.47%)
- Wake locks, partial wake locks
- Excessive background activity

### Staged Rollout
1. Start with 1-5% of users
2. Monitor crashes and reviews
3. Gradually increase percentage
4. Halt if issues detected

### Updates
- Use EAS Update for JS-only changes
- Native changes require new Play Store review
- Update release notes for each version

## Troubleshooting

### Common Rejection Reasons
1. **Privacy policy issues**: Ensure policy covers all data
2. **Permission issues**: Justify each permission
3. **Functionality issues**: Test on multiple devices
4. **Metadata issues**: Screenshots must match current app
5. **Deceptive behavior**: Don't mislead users

### Appeal Process
1. Use the Appeal button in Play Console
2. Provide detailed explanation
3. Reference specific policy if disputing
4. Be professional and factual
