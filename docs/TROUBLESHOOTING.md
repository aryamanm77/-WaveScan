# WΛVΞSCAN Troubleshooting & Diagnostic Guide

### 1. Board not detected on PC (COM Port Missing)
- **Symptom**: `arduino-cli board list` or Device Manager does not show a Silicon Labs CP2102 or CH340 COM port.
- **Fix**:
  1. Ensure the USB cable supports **data transfer** (some micro-USB cables only carry +5V power).
  2. Install the USB-to-UART bridge driver for your board:
     - [CP210x USB to UART Bridge VCP Drivers](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
     - [WCH CH340/CH341 USB Drivers](http://www.wch-ic.com/downloads/CH341SER_EXE.html)

---

### 2. Upload error: `A fatal error occurred: Failed to connect to ESP32: No serial data received.`
- **Symptom**: Flashing aborts with timeout dots `Connecting........_____.....`
- **Fix**:
  1. Hold down the **BOOT** (or **FLASH**) button on the ESP32 while the upload starts. Release it once `Writing at 0x00010000... (xx %)` appears.
  2. Alternatively, solder a 10µF electrolytic capacitor between the `EN` pin and `GND` to automate auto-reset timing.

---

### 3. Android phone cannot reach `http://<IP>/`
- **Symptom**: Browser times out with `ERR_CONNECTION_TIMED_OUT` or `ERR_NAME_NOT_RESOLVED`.
- **Causes & Fixes**:
  - **Client Isolation**: Some Android phone hotspots enable "AP Isolation" by default, preventing devices connected to the hotspot from communicating with each other.
    - *Fix 1*: Connect directly to the ESP32's standalone fallback network: `WΛVΞSCAN` (Password: `wavescan123`) and open `http://192.168.4.1/`.
    - *Fix 2*: Connect both your phone and ESP32 to your home Wi-Fi router.
  - **Mobile Data Fallback**: When connected to `WΛVΞSCAN`, Android may detect "No internet access" and route HTTP requests through cellular data (4G/5G).
    - *Fix*: In Android Wi-Fi settings, tap the prompt **"Wi-Fi has no internet access. Tap for options"** and choose **"Stay connected"** or temporarily disable Mobile Data.

---

### 4. Only 2.4 GHz networks show up (Where are 5 GHz networks?)
- **Explanation**: The ESP32-WROOM-32 silicon features an integrated 802.11 b/g/n 2.4 GHz radio. It does not contain a 5 GHz transceiver. All detected networks are accurate 2.4 GHz beacons (Channels 1–14).

---

### 5. Signal strength is numerically "inverted"
- **Explanation**: RSSI (Received Signal Strength Indicator) is measured in negative decibel milliwatts (`dBm`):
  - `-40 dBm` is an extremely strong signal (very close to AP).
  - `-70 dBm` is an average signal.
  - `-90 dBm` is a very weak signal (edge of coverage).
  - Therefore, `-45 dBm` is **stronger** than `-75 dBm`. WΛVΞSCAN calculates percentage as `clamp((RSSI + 100) * 2, 0, 100)`.

---

### 6. CSV Export fails or opens as garbage
- **Fix**: WΛVΞSCAN exports CSV compliant with RFC 4180 with standard UTF-8 CRLF encoding. If opening in Excel, use **Data &rarr; From Text/CSV** with comma delimiter.
