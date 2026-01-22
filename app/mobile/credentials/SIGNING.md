# App Signing & Certificate Management

## Overview

App signing ensures your app's authenticity and integrity. This document covers signing for both iOS and Android platforms.

## iOS Code Signing

### Certificate Types

| Certificate | Purpose | Validity |
|-------------|---------|----------|
| Development | Run on test devices | 1 year |
| Distribution | App Store & Ad Hoc | 1 year |

### Provisioning Profile Types

| Profile | Purpose | Device Limit |
|---------|---------|--------------|
| Development | Testing on registered devices | 100 |
| Ad Hoc | Beta distribution | 100 |
| App Store | Production release | Unlimited |
| Enterprise | Internal distribution | Unlimited |

### EAS Managed Signing (Recommended)

Let EAS handle signing automatically:

```bash
# Configure credentials (first time)
eas credentials --platform ios

# Options:
# 1. Let EAS manage everything (recommended)
# 2. Provide your own certificates

# EAS will:
# - Generate/manage certificates
# - Create provisioning profiles
# - Handle Push Notification keys
```

### Manual Certificate Setup

1. **Generate Certificate Signing Request (CSR)**
   - Open Keychain Access on Mac
   - Certificate Assistant > Request a Certificate
   - Save the CSR file

2. **Create Certificate in Apple Developer Portal**
   - Certificates, IDs & Profiles > Certificates
   - Click "+" and select type
   - Upload CSR
   - Download .cer file

3. **Install Certificate**
   - Double-click .cer file
   - Certificate added to Keychain

4. **Export for CI/CD**
   ```bash
   # Export as .p12 (includes private key)
   # From Keychain Access: Right-click > Export
   # Set strong password

   # For EAS, store as base64:
   base64 -i certificate.p12 | pbcopy
   ```

### Push Notification Credentials

**APNs Key (Recommended)**
- One key works for all apps
- Never expires
- Can only download once!

```
Key ID: XXXXXXXXXX
Team ID: XXXXXXXXXX
Key File: AuthKey_XXXXXXXXXX.p8
```

**APNs Certificate (Alternative)**
- Per-app certificate
- Expires in 1 year
- Must renew annually

## Android Signing

### Key Concepts

| Term | Description |
|------|-------------|
| Upload Key | You keep, used to sign uploads to Play |
| App Signing Key | Google keeps, signs final APK/AAB |
| Keystore | Container for keys |

### Generate Upload Key

```bash
# Create upload keystore
keytool -genkeypair \
  -v \
  -storetype PKCS12 \
  -keystore upload-keystore.jks \
  -alias upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

# Prompts for:
# - Keystore password
# - Key password
# - Name, Organization, Location details
```

### Store Key Information Securely

**CRITICAL: Store these values in a password manager!**

```
Keystore file: upload-keystore.jks
Keystore password: [SECURE PASSWORD]
Key alias: upload
Key password: [SECURE PASSWORD]

Certificate SHA-256 fingerprint:
[Run: keytool -list -v -keystore upload-keystore.jks]
```

### EAS Managed Signing

```bash
# Configure credentials (first time)
eas credentials --platform android

# Options:
# 1. Let EAS manage keystore (recommended for new apps)
# 2. Provide your own keystore

# For existing apps with published APKs:
# MUST use existing keystore or you can't update the app!
```

### Play App Signing

Enrollment in Play App Signing is required for new apps:

1. Go to Play Console > Release > Setup > App signing
2. Choose key management option:
   - **Recommended**: Let Google generate
   - **Alternative**: Upload existing key

Benefits:
- Google secures your app signing key
- Automatic key rotation if compromised
- Smaller downloads (optimized APKs)

## CI/CD Integration

### GitHub Actions Secrets

Store these in your repository secrets:

**iOS:**
- `APPLE_CERTIFICATE_P12_BASE64` - Distribution cert
- `APPLE_CERTIFICATE_PASSWORD` - Cert password
- `APPLE_PROVISIONING_PROFILE_BASE64` - Provisioning profile
- `EXPO_APPLE_ID` - Apple ID email
- `EXPO_APPLE_PASSWORD` - App-specific password

**Android:**
- `ANDROID_KEYSTORE_BASE64` - Upload keystore
- `ANDROID_KEYSTORE_PASSWORD` - Keystore password
- `ANDROID_KEY_ALIAS` - Key alias
- `ANDROID_KEY_PASSWORD` - Key password
- `GOOGLE_SERVICE_ACCOUNT_KEY` - Play API access

### EAS Secrets

Configure in `eas.json` or EAS dashboard:

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.chiroflow.com"
      }
    }
  }
}
```

Sensitive values via EAS CLI:
```bash
eas secret:create --name SENTRY_DSN --value "your-dsn"
```

## Security Best Practices

### Do's
- ✅ Use unique, strong passwords for each keystore
- ✅ Store credentials in password manager
- ✅ Keep backup copies in secure locations
- ✅ Use hardware security modules (HSM) for high-security apps
- ✅ Regularly audit who has access to signing credentials
- ✅ Use Play App Signing for Android

### Don'ts
- ❌ Never commit keystores/certificates to git
- ❌ Never share passwords in plain text (email, Slack)
- ❌ Never use the same key for multiple apps
- ❌ Never lose your keys (Android: can't update app!)
- ❌ Never store passwords in code or config files

## Recovery Procedures

### Lost iOS Certificate
1. Revoke old certificate in Developer Portal
2. Generate new certificate
3. Create new provisioning profiles
4. Rebuild and submit app

### Lost Android Keystore
**If using Play App Signing:**
- Generate new upload key
- Contact Play support to reset upload key

**If NOT using Play App Signing:**
- You CANNOT update your existing app
- Must publish as new app with new package name
- Users must manually install new app

## Rotation Schedule

| Credential | Rotation Frequency | Notes |
|------------|-------------------|-------|
| iOS Distribution Cert | Annual (forced) | Renew before expiry |
| iOS Push Cert | Annual (if used) | Switch to APNs Key |
| Android Upload Key | As needed | If compromised |
| CI/CD Service Accounts | Annual | Review permissions |

## Credential Inventory

Track all credentials in a secure document:

```
Last Updated: YYYY-MM-DD

iOS:
- Distribution Cert: Expires YYYY-MM-DD
- Push Key ID: XXXXXXXXXX (never expires)
- Provisioning Profile: Expires YYYY-MM-DD

Android:
- Upload Keystore: upload-keystore.jks
- SHA-256: XX:XX:XX:XX...
- Play App Signing: Enabled

Service Accounts:
- Google Play API: project-name@project.iam.gserviceaccount.com
- Firebase: firebase-adminsdk-xxxxx@project.iam.gserviceaccount.com
```
