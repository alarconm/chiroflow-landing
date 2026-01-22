# TestFlight Beta Testing Guide

## Overview

TestFlight is Apple's official beta testing platform for iOS apps. It allows you to invite up to 10,000 external testers to try your app before release.

## Setup Checklist

### Prerequisites
- [ ] Apple Developer Account ($99/year)
- [ ] App Store Connect app record created
- [ ] Distribution certificate configured
- [ ] App Store provisioning profile created

### Initial Configuration
- [ ] Configure test information
- [ ] Set up tester groups
- [ ] Prepare test builds

## Tester Types

### Internal Testers (App Store Connect Users)
- **Limit**: Up to 100 testers
- **Access**: Immediate (no review required)
- **Requirements**: Must be App Store Connect team members
- **Use case**: Development team, stakeholders

### External Testers (Public Beta)
- **Limit**: Up to 10,000 testers
- **Access**: After Beta App Review (~24-48 hours)
- **Requirements**: Valid email address
- **Use case**: Real users, larger beta groups

## Build Distribution

### Via EAS Build
```bash
# Build for TestFlight
eas build --platform ios --profile beta

# The build is automatically uploaded to App Store Connect
# Or submit manually:
eas submit --platform ios --profile beta
```

### Via Xcode
1. Archive the app (Product > Archive)
2. In Organizer, select "Distribute App"
3. Choose "App Store Connect"
4. Select "Upload"
5. Wait for processing (~15-30 minutes)

## TestFlight Configuration

### Test Information (Required for External Testing)

```markdown
## What to Test
- Patient appointment booking and management
- Provider schedule viewing
- Quick check-in functionality
- Offline mode capabilities
- Push notification delivery

## Beta App Description
ChiroFlow is a comprehensive practice management app for chiropractic clinics.
This beta version includes mobile schedule management, patient self-service,
and offline-capable charting features.

## Feedback Email
beta@chiroflow.com

## Marketing URL
https://chiroflow.com/beta

## Privacy Policy URL
https://chiroflow.com/privacy
```

### Build Metadata

For each build, provide:
- **What's New**: Brief description of changes
- **Test Notes**: Specific testing instructions
- **Known Issues**: List of known bugs

Example:
```markdown
## What's New in Build 1.0.0 (42)
- Added patient appointment booking
- Improved offline sync reliability
- Fixed crash when viewing large schedules

## Test Notes
1. Test booking an appointment with a new patient account
2. Enable airplane mode and verify offline access
3. Check push notifications arrive within 5 minutes

## Known Issues
- Calendar scrolling may lag on older devices
- Some notification sounds don't play on iOS 17.0
```

## Managing Testers

### Create Tester Groups

Organize testers by role:
1. **Internal Team** - Developers, QA
2. **Practice Staff** - Front desk, providers
3. **External Beta** - Selected clinics
4. **Public Beta** - Open enrollment

### Invite Internal Testers
1. App Store Connect > Users and Access
2. Add new users with "Customer Support" or higher role
3. In TestFlight, add them to internal testing group

### Invite External Testers
1. TestFlight > External Testing > Manage
2. Create new group or use existing
3. Add testers by email or public link

### Public Link
Generate a public link for easy signup:
1. TestFlight > External Testing > [Group]
2. Enable "Public Link"
3. Share link (up to 10,000 redemptions)

## Feedback Collection

### Built-in Feedback
- Users can take screenshots and submit feedback
- Crash logs automatically collected
- Beta tester comments visible in TestFlight

### Custom Feedback
Add in-app feedback mechanism:
```typescript
// Example feedback trigger
const submitBetaFeedback = async (feedback: string, screenshot?: string) => {
  await fetch('https://api.chiroflow.com/beta/feedback', {
    method: 'POST',
    body: JSON.stringify({
      feedback,
      screenshot,
      build: Constants.expoConfig?.version,
      deviceInfo: Device.modelName,
      osVersion: Device.osVersion,
    }),
  });
};
```

### Feedback Triage
Review feedback in:
- App Store Connect > TestFlight > Feedback
- Custom feedback system
- Support email inbox

## Build Management

### Automatic Updates
TestFlight automatically notifies testers of new builds.

Configure in app.json:
```json
{
  "expo": {
    "updates": {
      "enabled": true,
      "checkAutomatically": "ON_LOAD"
    }
  }
}
```

### Build Expiration
- Builds expire after 90 days
- Testers see warning before expiration
- Upload new build to continue testing

### Version Management
```
Version: 1.0.0 (Marketing version)
Build: 42 (Technical build number)

Increment build number for each upload.
Increment version for significant changes.
```

## Beta App Review

### Requirements for External Testing
- Privacy policy URL
- Test information filled out
- App icon and screenshots
- App passes basic functionality tests

### Review Timeline
- Initial review: 24-48 hours
- Updates to approved builds: Usually faster
- Rejected builds: Fix issues and resubmit

### Common Rejection Reasons
1. Crashes on launch
2. Missing privacy policy
3. Placeholder content
4. Broken login functionality
5. Missing required app metadata

## Analytics & Metrics

### TestFlight Metrics
- Installs per build
- Sessions per tester
- Crash-free sessions
- Tester retention

### Custom Analytics
Integrate analytics for beta:
```typescript
import * as Analytics from 'expo-analytics';

Analytics.track('beta_feature_used', {
  feature: 'appointment_booking',
  build: Constants.expoConfig?.version,
  testGroup: 'external_beta',
});
```

## Communication Templates

### Invitation Email
```
Subject: You're Invited to Beta Test ChiroFlow!

Hi [Name],

You've been selected to beta test ChiroFlow, our new practice management app.

To get started:
1. Install TestFlight from the App Store
2. Click: [TestFlight Link]
3. Follow the prompts to install ChiroFlow

We value your feedback! Please report any issues or suggestions through the app.

Thank you for helping us improve ChiroFlow!

The ChiroFlow Team
```

### New Build Announcement
```
Subject: New ChiroFlow Beta Build Available

Hi Beta Testers,

A new version of ChiroFlow is available in TestFlight!

What's New:
- [Feature 1]
- [Feature 2]
- Bug fixes and improvements

Please update and let us know what you think.

Known Issues:
- [Issue 1]
- [Issue 2]

Thanks for testing!
```

## Transition to Production

### Pre-Launch Checklist
- [ ] All critical bugs fixed
- [ ] Beta feedback addressed
- [ ] Performance acceptable
- [ ] Analytics verified
- [ ] App Store listing complete
- [ ] Privacy policy final
- [ ] Support documentation ready

### Gradual Rollout
1. Keep beta running alongside production
2. Phase out beta after stable production release
3. Thank beta testers with acknowledgment
