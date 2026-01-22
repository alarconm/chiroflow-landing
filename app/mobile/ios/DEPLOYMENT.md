# iOS App Store Deployment Guide

## Prerequisites

### Apple Developer Account
1. Enroll in the Apple Developer Program ($99/year)
2. Complete tax and banking information
3. Create App Store Connect record

### Required Certificates and Profiles

#### Distribution Certificate
```bash
# Generate CSR (Certificate Signing Request)
# In Keychain Access: Certificate Assistant > Request a Certificate from a Certificate Authority

# Upload to Apple Developer Portal > Certificates
# Download and install the .cer file
```

#### App Store Provisioning Profile
1. Go to Apple Developer Portal > Profiles
2. Create new "App Store Distribution" profile
3. Select your app's Bundle ID: `com.chiroflow.app`
4. Select your Distribution Certificate
5. Download and install the .mobileprovision file

### Push Notification Setup

#### APNs Key (Recommended)
1. Go to Apple Developer Portal > Keys
2. Create new key with APNs capability
3. Download the .p8 file (only downloadable once!)
4. Note the Key ID and Team ID

#### APNs Certificate (Alternative)
1. Go to Apple Developer Portal > Certificates
2. Create "Apple Push Notification service SSL (Sandbox & Production)"
3. Download and export as .p12 file

## App Store Connect Setup

### Create App Record
1. Log in to App Store Connect
2. My Apps > "+" > New App
3. Fill in:
   - Platform: iOS
   - Name: ChiroFlow
   - Primary Language: English (U.S.)
   - Bundle ID: com.chiroflow.app
   - SKU: CHIROFLOW-IOS-001

### App Information
- Category: Medical
- Secondary Category: Business (optional)
- Content Rights: Does not contain third-party content requiring rights
- Age Rating: 4+ (no objectionable content)

### Pricing and Availability
- Price: Free
- Availability: All territories (or select specific)
- Release: Manual release after approval

## Build and Submit

### Using EAS Build
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Configure project (first time)
eas build:configure

# Build for App Store
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios --profile production
```

### Manual Build (Xcode)
```bash
# Generate native project
npx expo prebuild --platform ios

# Open in Xcode
open ios/ChiroFlow.xcworkspace

# In Xcode:
# 1. Select "Any iOS Device (arm64)" as build target
# 2. Product > Archive
# 3. Window > Organizer
# 4. Distribute App > App Store Connect
```

## App Review Guidelines Compliance

### Health App Requirements
- [ ] Clearly explain medical disclaimer
- [ ] Do not claim to diagnose or treat conditions
- [ ] Protect user health data (HIPAA compliant)
- [ ] Provide accurate information

### Privacy Requirements
- [ ] Privacy policy URL in App Store Connect
- [ ] App Privacy labels completed
- [ ] NSPrivacyAccessedAPITypes in Info.plist if needed

### Technical Requirements
- [ ] Support current and previous iOS version (iOS 17+)
- [ ] Runs on all supported device sizes
- [ ] No crashes or major bugs
- [ ] Proper use of iOS design guidelines

## App Store Listing Checklist

### Required Assets
- [ ] App Icon (1024x1024, no alpha)
- [ ] Screenshots (6.7", 6.5", 5.5" iPhone, iPad Pro)
- [ ] App Preview videos (optional but recommended)

### Required Information
- [ ] App name (30 chars max)
- [ ] Subtitle (30 chars max)
- [ ] Description (4000 chars max)
- [ ] Keywords (100 chars total)
- [ ] Support URL
- [ ] Marketing URL
- [ ] Privacy Policy URL

### Review Information
- [ ] Demo account credentials
- [ ] Contact phone number
- [ ] Contact email
- [ ] Notes for reviewers

## TestFlight Beta Testing

### Internal Testing (Up to 100 testers)
1. Build uploaded to App Store Connect
2. Add testers via email (must be App Store Connect users)
3. Testers get immediate access (no review)

### External Testing (Up to 10,000 testers)
1. Build must pass Beta App Review
2. Add testers via email or public link
3. Groups can be created for different user types

### Test Information Required
- What to test
- Test credentials
- Known issues
- Feedback email

## Post-Launch

### Monitoring
- [ ] Monitor crash reports in App Store Connect
- [ ] Check user reviews daily initially
- [ ] Track download and engagement metrics

### Updates
- [ ] Plan regular update cadence
- [ ] Use EAS Update for OTA JavaScript updates
- [ ] Native changes require new App Store review

## Troubleshooting

### Common Rejection Reasons
1. **Crashes**: Test thoroughly on physical devices
2. **Incomplete Information**: Fill all metadata completely
3. **Broken Links**: Verify support and privacy URLs
4. **Missing Features**: Ensure app is functional without login if possible
5. **Placeholder Content**: Remove all placeholder text/images

### Appeal Process
1. Use Resolution Center in App Store Connect
2. Be professional and specific
3. Provide evidence/documentation if needed
