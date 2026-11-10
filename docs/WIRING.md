# WAVESCAN Hardware & Power Wiring Guide

## 1. Hardware Architecture (₹0 Additional Budget)

WAVESCAN is designed as a minimalist, zero-extra-hardware project:
- **No OLED / LCD displays needed** &rarr; Phone screen acts as the rich graphical display.
- **No external sensors needed** &rarr; ESP32's onboard RF silicon handles all 2.4 GHz packet sniffing and RSSI telemetry.
- **No external battery packs required** &rarr; Can be powered directly from your Android phone via USB OTG or any standard USB port / power bank.

---

## 2. Power Options

### Option A: USB OTG Power from Android Phone (Portable Field Analyzer)
```text
+-----------------------+                    +------------------------+
|                       |  USB OTG Cable     |                        |
|  Android Smartphone   | =================> |  ESP32-WROOM-32        |
|  (Acts as 5V Host)    |                    |  (Micro-USB / Type-C)  |
|                       |                    |                        |
+-----------------------+                    +------------------------+
```
- Most modern Android smartphones support **USB Host / OTG**.
- Using a USB-C to Micro-USB (or USB-C to USB-C) cable, your phone powers the ESP32 directly.
- Total power draw of ESP32 during Wi-Fi scanning is ~80–120 mA, consuming less than 3% phone battery per hour of continuous surveying.

### Option B: Power Bank / Wall Adapter
- Connect any 5V USB power bank or phone charger to the ESP32 USB port.
- Range of operation: ~15 to 30 meters from the ESP32 while surveying.

---

## 3. Development Board Pinout Reference (ESP32-WROOM-32)

No external pins or breadboards are required for basic operation. However, the onboard LEDs provide visual hardware telemetry:

| Feature | Pin | Description |
|---|---|---|
| **Power LED** | 3.3V Rail | Solid RED when powered |
| **Status/Activity LED** | GPIO 2 | Can be used as scan activity indicator |
| **Boot Button** | GPIO 0 | Press to enter download mode if flashing fails |
| **EN (Reset) Button** | EN / CHIP_PU | Press once to reboot board |

---

## 4. RF Considerations for Accurate Scanning
- Keep metal objects, battery cases, and hands at least 2 cm away from the PCB trace antenna (the squiggly copper trace at the tip of the ESP32 module).
- Holding the ESP32 upright (antenna pointing upwards) yields the most uniform omnidirectional radiation pattern for 2.4 GHz surveying.
