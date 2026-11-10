# WΛVΞSCAN Installation & Flashing Guide

This guide walks you through compiling and flashing **WΛVΞSCAN** onto your ESP32-WROOM-32 development board using either **Arduino IDE** or **Arduino CLI**.

---

## 1. Prerequisites

- **ESP32-WROOM-32** development board (30-pin or 38-pin).
- Micro-USB or USB-C data cable (ensure it supports data transfer, not just charging).
- Android smartphone with Wi-Fi & Hotspot capability.
- Google Chrome browser on Android.
- Windows PC with Antigravity IDE / Arduino IDE installed.

---

## 2. Arduino IDE Setup (GUI Method)

### Step 2.1: Install ESP32 Board Package
1. Open **Arduino IDE**.
2. Go to **File** &rarr; **Preferences**.
3. In the **Additional boards manager URLs** field, paste:
   ```text
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. Click **OK**.
5. Go to **Tools** &rarr; **Board** &rarr; **Boards Manager...**.
6. Search for `esp32` by *Espressif Systems* and click **Install** (version 2.0.x or 3.x).

### Step 2.2: Install Required Libraries
1. Go to **Sketch** &rarr; **Include Library** &rarr; **Manage Libraries...**.
2. Search for `ArduinoJson` by *Benoît Blanchon* and install version **7.x** (or 6.x).
   *(WiFi.h, WebServer.h, and LittleFS.h are built directly into the ESP32 core).*

### Step 2.3: Configure Hotspot Credentials
1. Open `firmware/WAVESCAN/WAVESCAN.ino`.
2. Locate lines 24–29:
   ```cpp
   const char* DEFAULT_HOTSPOT_SSID = "AndroidAP"; // Replace with your phone's hotspot name
   const char* DEFAULT_HOTSPOT_PASS = "12345678";  // Replace with your hotspot password

   const char* FALLBACK_AP_SSID = "WΛVΞSCAN";
   const char* FALLBACK_AP_PASS = "wavescan123";
   ```
3. Update them to match your phone's 2.4 GHz personal hotspot if desired.
   *(Note: If you leave them as is or your hotspot is turned off, WΛVΞSCAN will automatically broadcast its own fallback Wi-Fi network named `WΛVΞSCAN` with password `wavescan123`).*

### Step 2.4: Select Board & Port
1. Connect the ESP32 to your PC via USB.
2. In Arduino IDE, select **Tools** &rarr; **Board** &rarr; **esp32** &rarr; **ESP32 Dev Module**.
3. Select **Tools** &rarr; **Port** &rarr; your COM port (e.g., `COM5`).
4. Recommended Upload Settings:
   - **Upload Speed**: `921600` (or `115200` if upload fails)
   - **CPU Frequency**: `240MHz`
   - **Flash Frequency**: `80MHz`
   - **Flash Mode**: `QIO`
   - **Partition Scheme**: `Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)`

### Step 2.5: Compile & Flash
1. Click the **Upload** button (arrow icon in toolbar).
2. If the terminal prints `Connecting........_____.....`, press and hold the **BOOT** button on the ESP32 until the flashing begins.
3. Open the **Serial Monitor** at **115200 baud** to view the assigned IP address!

---

## 3. Command-Line Flashing (Arduino CLI)

For developers using PowerShell inside Antigravity:

```powershell
# 1. Compile the sketch
& "D:\aurd\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe" compile --fqbn esp32:esp32:esp32 "C:\Users\User\.gemini\antigravity\scratch\WAVESCAN\firmware\WAVESCAN"

# 2. Upload to connected board on COM5
& "D:\aurd\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe" upload -p COM5 --fqbn esp32:esp32:esp32 "C:\Users\User\.gemini\antigravity\scratch\WAVESCAN\firmware\WAVESCAN"
```

---

## 4. Connecting from Android Phone

### Mode A: Standalone SoftAP Mode (Zero-Config Default)
1. The ESP32 broadcasts its own Wi-Fi:
   - **SSID**: `WΛVΞSCAN`
   - **Password**: `wavescan123`
2. Connect your phone's Wi-Fi to `WΛVΞSCAN`.
3. Open **Android Chrome** and browse to:
   ```text
   http://192.168.4.1/
   ```
4. Tap **"Install App"** on the banner or in Chrome menu (⋮) -> **"Add to Home screen"** / **"Install app"** for a full-screen native Android PWA experience!

### Mode B: Android Hotspot Mode
1. On your Android phone, enable **Personal Hotspot** (ensure band is set to **2.4 GHz**).
2. Set Hotspot SSID to `AndroidAP` and password to `12345678` (or update in `WAVESCAN.ino`).
3. Power on the ESP32.
4. The ESP32 connects to your hotspot in ~3 seconds.
5. Check your phone's connected devices list or the Serial Monitor for the ESP32 IP address (e.g., `192.168.43.150`).
6. Open **Android Chrome** and enter:
   ```text
   http://192.168.43.150/
   ```
