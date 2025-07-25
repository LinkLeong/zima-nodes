# ZimaOS Client - Chrome Extension

A Chrome browser extension for managing and quickly accessing ZimaOS systems.

## Features

- 🔧 **Configuration Management**: Easily configure ZimaOS IP address, username, and password
- 🔐 **Auto Login**: Integrated ZimaOS login API with automatic token acquisition and management
- 🔄 **Token Management**: Automatically refresh expired access tokens without re-login
- 🏠 **Quick Access**: One-click access to ZimaOS homepage
- 📱 **App Shortcuts**: Quick access to commonly used ZimaOS applications
- 🔄 **Connection Status**: Real-time display of ZimaOS connection status
- ⚙️ **Settings Management**: Modify connection configuration anytime
- 🐛 **Debug Features**: Built-in debug logging for development and troubleshooting

## Installation

### Developer Mode Installation (Recommended for Testing)

1. Download or clone this project locally
2. Open Chrome browser and navigate to the extensions management page:
   - Method 1: Enter `chrome://extensions/` in the address bar
   - Method 2: Click the three-dot menu in the top right → More tools → Extensions
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked"
5. Select the project folder
6. Extension installation complete!

## Usage Instructions

### Initial Configuration

1. After installing the extension, click the ZimaOS icon in the browser toolbar
2. First-time use will show a configuration prompt, click "Start Configuration"
3. Fill in the following information:
   - **ZimaOS Address**: Your ZimaOS system IP address and port (e.g., `192.168.1.100:8080`)
   - **Username**: ZimaOS login username
   - **Password**: ZimaOS login password
4. Click "Test Connection" to verify the configuration is correct
5. Click "Save Configuration" to complete setup

### Daily Usage

1. **Quick Access**: Click the extension icon, then click "Open ZimaOS" to directly access the system homepage
2. **App Shortcuts**: Click app icons in the extension popup to quickly open corresponding features
3. **View Status**: The extension displays current ZimaOS connection status (online/offline)
4. **Modify Configuration**: Click the settings button or "Modify Configuration" to update connection information

### Available App Shortcuts

- 📁 **File Manager**: Access ZimaOS file manager
- 🎵 **Media Center**: Open media playback and management
- 🐳 **Docker**: Manage Docker containers
- ⚙️ **System Settings**: Access system configuration
- 💻 **Terminal**: Open web terminal
- 📊 **System Monitor**: View system performance monitoring

## Debug Guide

### Development Environment Setup

1. Ensure the extension is installed following the above method
2. Find "ZimaOS Client" on the Chrome extensions page
3. Click "Details" to enter the extension details page

### Debugging Methods

#### 1. View Console Logs

**Popup Page Debugging**:
- Right-click the extension icon and select "Inspect popup"
- View logs in the Console tab of developer tools

**Configuration Page Debugging**:
- Click "Extension options" on the extension details page
- Press F12 on the configuration page to open developer tools

**Background Script Debugging**:
- Click "Inspect views" next to "service worker" on the extension details page
- View background script logs

#### 2. Common Issue Troubleshooting

**Connection Test Failed**:
- Check if ZimaOS address format is correct
- Confirm ZimaOS system is running
- Check network connection
- Look for CORS errors in browser console

**Extension Cannot Load**:
- Check if manifest.json syntax is correct
- Confirm all referenced file paths exist
- Check error messages on Chrome extensions page

**Style Display Issues**:
- Check if CSS file paths are correct
- Confirm files exist in styles directory
- Use developer tools to check CSS loading

#### 3. Reload Extension

After modifying code, you need to reload the extension:
1. Go to `chrome://extensions/`
2. Find the "Zima Nodes" extension
3. Click the refresh button (🔄)
4. Re-test functionality

### File Structure

```
zima-client/
├── manifest.json          # Extension configuration file
├── popup.html             # Main popup page
├── options.html           # Configuration page
├── background.js          # Background script
├── scripts/
│   ├── popup.js          # Popup page script
│   └── options.js        # Configuration page script
├── styles/
│   ├── popup.css         # Popup page styles
│   └── options.css       # Configuration page styles
├── icons/
│   └── icon.svg          # Extension icon
└── README.md             # Documentation
```

## Technical Details

- **Manifest Version**: 3 (Latest version)
- **Permissions**: storage (store configuration), activeTab (open tabs)
- **Storage**: Uses Chrome Storage API for synchronized configuration storage
- **Compatibility**: Chrome 88+

## Important Notes

1. The extension uses Chrome Storage API to store configuration information, data will sync across devices logged into the same Google account
2. Passwords are stored locally in plain text, please ensure device security
3. Connection testing uses simple HTTP requests, which may be limited by CORS policies
4. Recommended for use in LAN environments to ensure ZimaOS system security

## License

Apache License 2.0
